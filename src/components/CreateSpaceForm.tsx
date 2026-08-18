'use client';

// src/components/CreateSpaceForm.tsx
//
// Controlled form for creating a new audio space. POSTs JSON to /api/spaces
// and, on success, either navigates to the new space (start-now mode) or
// back to the spaces list (schedule mode). The primary action is "Start
// now"; a caret button beside it opens a dropdown exposing "Schedule for
// later".

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
} from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { PublicSpace } from '@/types';

type Mode = 'now' | 'schedule';

interface StartNowJoinPayload {
  token: string;
  wsUrl: string;
  role: string;
  roomName: string;
  identity: string;
  handle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatLocal(date: Date): string {
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  );
}

/**
 * Returns the next 15-minute local-time boundary strictly after `reference`.
 * The seconds and milliseconds are zeroed before rounding so the result is
 * always exactly on a quarter-hour mark.
 */
function nextLocalQuarterHour(reference: Date): Date {
  const candidate = new Date(reference);
  candidate.setSeconds(0, 0);
  const minutes = candidate.getMinutes();
  const add = minutes % 15 === 0 ? 15 : 15 - (minutes % 15);
  candidate.setMinutes(minutes + add);
  return candidate;
}

/**
 * Default value for the schedule input: next 15-minute boundary, clamped to
 * 30 days from now. If the candidate exceeds the 30-day cap, fall back to
 * the cap rounded down to the nearest 15-minute boundary.
 */
function computeDefaultSchedule(now: Date = new Date()): string {
  const max = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const candidate = nextLocalQuarterHour(now);
  let result = candidate;
  if (result.getTime() > max.getTime()) {
    const clamped = new Date(max);
    clamped.setSeconds(0, 0);
    const minutes = clamped.getMinutes();
    clamped.setMinutes(minutes - (minutes % 15));
    result = clamped;
  }
  return formatLocal(result);
}

export function CreateSpaceForm(): ReactElement {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mode, setMode] = useState<Mode>('now');
  const [scheduleInput, setScheduleInput] = useState<string>(() =>
    computeDefaultSchedule()
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close the dropdown on outside click or Escape. The handler only runs
  // while the menu is open; it is detached as soon as the menu closes.
  useEffect(() => {
    if (!menuOpen) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        menuRef.current &&
        target &&
        !menuRef.current.contains(target)
      ) {
        setMenuOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  const chooseSchedule = useCallback(() => {
    setMode('schedule');
    setScheduleInput((current) =>
      current && current.length > 0 ? current : computeDefaultSchedule()
    );
    setMenuOpen(false);
  }, []);

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submitting) return;
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        setError('Title is required.');
        return;
      }
      setSubmitting(true);
      setError(null);
      try {
        const trimmedDescription = description.trim();
        const payload: {
          title: string;
          description?: string;
          startNow?: true;
          scheduledAt?: string;
        } = { title: trimmedTitle };
        if (trimmedDescription) {
          payload.description = trimmedDescription;
        }
        if (mode === 'now') {
          payload.startNow = true;
        } else {
          const trimmedSchedule = scheduleInput.trim();
          if (!trimmedSchedule) {
            setError('Schedule date is required.');
            setSubmitting(false);
            return;
          }
          // `<input type="datetime-local">` returns a local-time string
          // like "2025-01-31T19:00" with no timezone. Convert to an ISO
          // string so the server interprets the schedule in the user's
          // wall clock.
          const parsed = new Date(trimmedSchedule);
          if (Number.isNaN(parsed.getTime())) {
            setError('Schedule date is not valid.');
            setSubmitting(false);
            return;
          }
          payload.scheduledAt = parsed.toISOString();
        }
        const res = await fetch('/api/spaces', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const body = (await res.json().catch(() => ({}))) as {
          space?: PublicSpace;
          startNow?: boolean;
          token?: string;
          wsUrl?: string;
          role?: string;
          roomName?: string;
          identity?: string;
          handle?: string;
          displayName?: string | null;
          avatarUrl?: string | null;
          message?: string;
          error?: string;
        };
        if (!res.ok || !body.space) {
          setError(
            body.message ||
              body.error ||
              `Failed to create space (HTTP ${res.status}).`
          );
          return;
        }
        if (
          body.startNow === true &&
          body.token &&
          body.wsUrl &&
          body.role &&
          body.roomName &&
          body.identity &&
          body.handle
        ) {
          const join: StartNowJoinPayload = {
            token: body.token,
            wsUrl: body.wsUrl,
            role: body.role,
            roomName: body.roomName,
            identity: body.identity,
            handle: body.handle,
            displayName: body.displayName ?? null,
            avatarUrl: body.avatarUrl ?? null,
          };
          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(
              `rabble_join_${body.space.id}`,
              JSON.stringify(join)
            );
          }
          router.push(`/space/${body.space.id}`);
          return;
        }
        router.push('/spaces');
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Unexpected error creating space.'
        );
      } finally {
        setSubmitting(false);
      }
    },
    [description, mode, router, scheduleInput, submitting, title]
  );

  const submitLabel = submitting
    ? 'Creating…'
    : mode === 'now'
      ? 'Start now'
      : 'Schedule';

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="title" className="text-sm font-medium text-slate-200">
          Title
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Weekly Bluesky Builders Roundup"
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
          data-testid="title-input"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor="description"
          className="text-sm font-medium text-slate-200"
        >
          Description <span className="text-slate-500">(optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this space about?"
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
          data-testid="description-input"
        />
      </div>
      {mode === 'schedule' ? (
        <div className="flex flex-col gap-1">
          <label
            htmlFor="scheduleInput"
            className="text-sm font-medium text-slate-200"
          >
            Schedule for later
          </label>
          <input
            id="scheduleInput"
            name="scheduleInput"
            type="datetime-local"
            step={900}
            value={scheduleInput}
            onChange={(e) => setScheduleInput(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
            data-testid="schedule-input"
          />
          <p className="text-xs text-slate-500">
            15-minute increments, up to 30 days in the future.
          </p>
        </div>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-700 bg-red-900/30 px-3 py-2 text-sm text-red-200"
          data-testid="form-error"
        >
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <Link
          href="/spaces"
          className="rounded-md border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800"
        >
          Cancel
        </Link>
        <div className="relative inline-flex" ref={menuRef}>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-l-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            data-testid="submit-button"
          >
            {submitLabel}
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            disabled={submitting}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="More create options"
            className="rounded-r-md border-l border-sky-700 bg-sky-600 px-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            data-testid="caret-button"
          >
            <span aria-hidden="true">▾</span>
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-10 mt-1 min-w-[12rem] rounded-md border border-slate-700 bg-slate-900 py-1 text-sm shadow-lg"
              data-testid="schedule-menu"
            >
              <button
                type="button"
                role="menuitem"
                onClick={chooseSchedule}
                className="block w-full px-3 py-2 text-left text-slate-100 hover:bg-slate-800"
                data-testid="schedule-menu-item"
              >
                Schedule for later
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
}

export default CreateSpaceForm;
