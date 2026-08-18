// src/components/RecordingDownload.tsx
//
// Client component that shows the host the status of the latest recording
// for a space and exposes a download link / refresh button.
//
// States:
//   - "starting"  : recording row exists but no file yet
//   - "available" : show download button
//   - "failed" / "expired" : show informational text only

'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';

type RecordingStatus = 'starting' | 'available' | 'failed' | 'expired';

interface PublicRecording {
  id: string;
  spaceId: string;
  status: RecordingStatus;
  startedAt: string;
  endedAt: string | null;
  expiresAt: string;
  sizeBytes: number | null;
  downloadUrl: string | null;
  contentType: string;
}

interface RecordingDownloadProps {
  spaceId: string;
  initial: PublicRecording | null;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return d.toLocaleString();
}

export function RecordingDownload({
  spaceId,
  initial,
}: RecordingDownloadProps): ReactElement | null {
  const [recording, setRecording] = useState<PublicRecording | null>(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refresh metadata on mount so a "starting" recording that finished
  // uploading while the page was open becomes "available".
  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/spaces/${spaceId}/recording`, {
        method: 'GET',
        cache: 'no-store',
      });
      const body = await res
        .json()
        .catch(() => ({} as { recording?: PublicRecording | null }));
      if (res.ok) {
        setRecording(body.recording ?? null);
      }
    } catch {
      // Silent — the recording chip is a non-critical UI element.
    }
  }, [spaceId]);

  useEffect(() => {
    void reload();
    // Poll every 15s while the recording is still in "starting" so the UI
    // transitions to "available" without a manual refresh.
    const interval = window.setInterval(() => {
      void reload();
    }, 15000);
    return () => window.clearInterval(interval);
  }, [reload]);

  const onRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/spaces/${spaceId}/recording`, {
        method: 'POST',
      });
      const body = (await res
        .json()
        .catch(() => ({}))) as { downloadUrl?: string; error?: string };
      if (!res.ok) {
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      if (body.downloadUrl) {
        setRecording((prev) =>
          prev ? { ...prev, downloadUrl: body.downloadUrl! } : prev
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed.');
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, spaceId]);

  if (!recording) return null;

  return (
    <section
      className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-200"
      data-testid="recording-download"
      data-status={recording.status}
    >
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Recording</h3>
        <span
          className="rounded-full bg-slate-800 px-2 py-0.5 text-xs"
          data-testid="recording-status"
        >
          {recording.status}
        </span>
      </header>

      {recording.status === 'starting' ? (
        <p className="text-xs text-slate-400">
          Recording is being prepared. Available until{' '}
          {formatDate(recording.expiresAt)}.
        </p>
      ) : null}

      {recording.status === 'available' ? (
        <>
          <p className="text-xs text-slate-400">
            Recorded {formatDate(recording.startedAt)} —{' '}
            {formatBytes(recording.sizeBytes)}. Available until{' '}
            {formatDate(recording.expiresAt)}.
          </p>
          <div className="flex gap-2">
            <a
              href={recording.downloadUrl ?? '#'}
              download
              className="inline-block rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
              data-testid="recording-download-link"
            >
              Download recording
            </a>
            <button
              type="button"
              onClick={() => {
                void onRefresh();
              }}
              disabled={refreshing}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              data-testid="recording-refresh-button"
            >
              {refreshing ? 'Refreshing…' : 'Refresh link'}
            </button>
          </div>
        </>
      ) : null}

      {recording.status === 'expired' ? (
        <p className="text-xs text-slate-400">
          This recording has been deleted (past the 30-day retention window).
        </p>
      ) : null}

      {recording.status === 'failed' ? (
        <p className="text-xs text-slate-400">
          Recording failed. The host can try ending and starting live again.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-700 bg-red-900/30 px-2 py-1 text-xs text-red-200"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

export default RecordingDownload;
