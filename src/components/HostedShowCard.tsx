'use client';

// src/components/HostedShowCard.tsx
//
// One station the signed-in user hosts, with its lifetime numbers and the
// recordings it produced. Each finished recording has a publish toggle
// that adds it to (or removes it from) the host's podcast feed.

import { useCallback, useState, type ReactElement } from 'react';
import { Button, Card } from '@/components/ui';
import { StartShowButton } from '@/components/StartShowButton';
import type { PublicSpace } from '@/types';

export interface HostedRecording {
  id: string;
  status: 'starting' | 'available' | 'failed' | 'expired';
  startedAt: string;
  endedAt: string | null;
  sizeBytes: number | null;
  published: boolean;
  publishedAt: string | null;
}

export interface HostedShowCardProps {
  space: PublicSpace;
  recordings: HostedRecording[];
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatHosted(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

function statusLabel(space: PublicSpace): { label: string; className: string } {
  if (space.isLive || space.status === 'live') {
    return { label: 'On air', className: 'bg-[var(--color-live-muted)] text-[var(--color-live)]' };
  }
  switch (space.status) {
    case 'scheduled':
      return { label: 'Scheduled', className: 'bg-[var(--color-accent-muted)] text-[var(--color-accent-2-700)]' };
    case 'active':
      return { label: 'Off air', className: 'bg-[var(--color-success-muted)] text-[var(--color-success)]' };
    case 'expired':
    case 'ended':
      return { label: 'Ended', className: 'bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)]' };
    default:
      return { label: space.status, className: 'bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)]' };
  }
}

function RecordingRow({ recording: initial }: { recording: HostedRecording }): ReactElement {
  const [recording, setRecording] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/recordings/${encodeURIComponent(recording.id)}/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ published: !recording.published }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        recording?: HostedRecording;
        error?: string;
        message?: string;
      };
      if (!res.ok || !body.recording) {
        setError(body.message || body.error || `HTTP ${res.status}`);
        return;
      }
      setRecording(body.recording);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the recording.');
    } finally {
      setBusy(false);
    }
  }, [busy, recording.id, recording.published]);

  const playable = recording.status === 'available';
  const meta = [formatDate(recording.startedAt), formatBytes(recording.sizeBytes)]
    .filter(Boolean)
    .join(' · ');

  return (
    <li
      className="flex flex-col gap-2 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] p-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid={`recording-${recording.id}`}
      data-published={recording.published ? 'true' : 'false'}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-body text-[var(--color-text)]">{meta || 'Recording'}</span>
        <span className="text-caption text-[var(--color-text-tertiary)]">
          {recording.status === 'available'
            ? recording.published
              ? `Published to your podcast feed${recording.publishedAt ? ` · ${formatDate(recording.publishedAt)}` : ''}`
              : 'Not published'
            : recording.status === 'starting'
              ? 'Processing…'
              : recording.status === 'failed'
                ? 'Recording failed'
                : 'Expired'}
        </span>
        {error ? (
          <span role="alert" className="text-caption text-[var(--color-live)]" data-testid="recording-error">
            {error}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {playable ? (
          <Button
            href={`/api/recordings/${encodeURIComponent(recording.id)}/audio`}
            variant="ghost"
            size="sm"
            data-testid="recording-download"
          >
            Download
          </Button>
        ) : null}
        <Button
          type="button"
          variant={recording.published ? 'secondary' : 'primary'}
          size="sm"
          disabled={!playable || busy}
          onClick={() => {
            void toggle();
          }}
          aria-pressed={recording.published}
          data-testid="recording-publish-toggle"
        >
          {busy ? 'Working…' : recording.published ? 'Unpublish' : 'Publish episode'}
        </Button>
      </div>
    </li>
  );
}

/** A URL with a copy button; this is what hosts share. */
function ShareLine({
  url,
  testId = 'hosted-show-share',
  urlTestId = 'hosted-show-share-url',
  copyTestId = 'hosted-show-copy',
}: {
  url: string;
  testId?: string;
  urlTestId?: string;
  copyTestId?: string;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the URL is selectable text right there.
    }
  }, [url]);
  return (
    <div
      className="flex items-center gap-2 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
      data-testid={testId}
    >
      <a
        href={url}
        className="min-w-0 flex-1 truncate text-caption text-[var(--color-accent-2-700)] hover:underline"
        data-testid={urlTestId}
      >
        {url}
      </a>
      <Button type="button" variant="ghost" size="sm" onClick={() => void copy()} data-testid={copyTestId}>
        {copied ? 'Copied' : 'Copy link'}
      </Button>
    </div>
  );
}

/** Toggle to turn a show's own podcast feed, scoped to just its episodes, on or off. */
function PodcastFeedToggle({ spaceId, enabled: initialEnabled, feedUrl: initialFeedUrl }: {
  spaceId: string;
  enabled: boolean;
  feedUrl: string | null;
}): ReactElement {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [feedUrl, setFeedUrl] = useState(initialFeedUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/spaces/${encodeURIComponent(spaceId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ podcastFeedEnabled: !enabled }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        space?: { podcastFeedEnabled: boolean; podcastFeedUrl: string | null };
        error?: string;
        message?: string;
      };
      if (!res.ok || !body.space) {
        setError(body.message || body.error || `HTTP ${res.status}`);
        return;
      }
      setEnabled(body.space.podcastFeedEnabled);
      setFeedUrl(body.space.podcastFeedUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the show feed.');
    } finally {
      setBusy(false);
    }
  }, [busy, enabled, spaceId]);

  return (
    <div
      className="flex flex-col gap-2 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
      data-testid="hosted-show-podcast-feed"
      data-enabled={enabled ? 'true' : 'false'}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-label font-semibold text-[var(--color-text)]">Show podcast feed</span>
          <span className="text-caption text-[var(--color-text-tertiary)]">
            {enabled ? 'On — a feed of just this show.' : 'Give this show its own feed, separate from your account feed.'}
          </span>
        </div>
        <Button
          type="button"
          variant={enabled ? 'secondary' : 'primary'}
          size="sm"
          disabled={busy}
          onClick={() => {
            void toggle();
          }}
          aria-pressed={enabled}
          data-testid="hosted-show-podcast-feed-toggle"
        >
          {busy ? 'Working…' : enabled ? 'Turn off' : 'Turn on'}
        </Button>
      </div>
      {error ? (
        <span role="alert" className="text-caption text-[var(--color-live)]" data-testid="hosted-show-podcast-feed-error">
          {error}
        </span>
      ) : null}
      {enabled && feedUrl ? (
        <ShareLine
          url={feedUrl}
          testId="hosted-show-podcast-feed-share"
          urlTestId="hosted-show-podcast-feed-url"
          copyTestId="hosted-show-podcast-feed-copy"
        />
      ) : null}
    </div>
  );
}

export function HostedShowCard({ space, recordings }: HostedShowCardProps): ReactElement {
  const badge = statusLabel(space);
  const stats = [
    `${space.sessionCount} ${space.sessionCount === 1 ? 'show' : 'shows'}`,
    `${space.totalListeners} ${space.totalListeners === 1 ? 'listener' : 'listeners'}`,
    `${space.likeCount} ${space.likeCount === 1 ? 'like' : 'likes'}`,
    `${formatHosted(space.hostedSeconds)} on air`,
  ].join(' · ');

  return (
    <Card className="flex flex-col gap-3" data-testid={`hosted-show-${space.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="truncate text-title font-semibold text-[var(--color-text)]">{space.title}</h3>
          <p className="text-caption text-[var(--color-text-secondary)]" data-testid="hosted-show-stats">
            {stats}
          </p>
          {space.tags.length > 0 ? (
            <p className="text-caption text-[var(--color-text-tertiary)]">{space.tags.join(' · ')}</p>
          ) : null}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-caption font-medium ${badge.className}`}
          data-testid="hosted-show-status"
        >
          {badge.label}
        </span>
      </div>

      {recordings.length > 0 ? (
        <ul className="flex flex-col gap-2" data-testid="hosted-show-recordings">
          {recordings.map((r) => (
            <RecordingRow key={r.id} recording={r} />
          ))}
        </ul>
      ) : (
        <p className="text-caption text-[var(--color-text-tertiary)]">No recordings yet.</p>
      )}

      <ShareLine url={space.shareableUrl} />

      <PodcastFeedToggle
        spaceId={space.id}
        enabled={space.podcastFeedEnabled}
        feedUrl={space.podcastFeedUrl}
      />

      <div className="flex flex-wrap gap-2">
        {space.isLive ? null : (
          <StartShowButton spaceId={space.id} size="sm" label="Start a session" />
        )}
        <Button href={`/show/${encodeURIComponent(space.id)}`} variant="secondary" size="sm" data-testid="hosted-show-open">
          {space.isLive ? 'Back to the room' : 'Show page'}
        </Button>
      </div>
    </Card>
  );
}

export default HostedShowCard;
