'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';

export interface AddToCalendarProps {
  spaceId: string;
  title: string;
  description?: string | null;
  /** ISO timestamp for when the space is scheduled to go live. */
  scheduledAt: string;
  /** Public shareable URL for the space. */
  url: string;
}

/** Default duration for a scheduled space event (1 hour). */
const DEFAULT_DURATION_MS = 60 * 60 * 1000;

/** Escape text for use inside an iCal VEVENT. */
function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Format a Date as `YYYYMMDDTHHMMSSZ` (iCal / Google Calendar). */
function formatDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function AddToCalendar({
  spaceId,
  title,
  description,
  scheduledAt,
  url,
}: AddToCalendarProps): ReactElement {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const start = useMemo(() => new Date(scheduledAt), [scheduledAt]);
  const end = useMemo(
    () => new Date(start.getTime() + DEFAULT_DURATION_MS),
    [start]
  );

  const googleUrl =
    'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    `&text=${encodeURIComponent(title)}` +
    `&dates=${formatDate(start)}/${formatDate(end)}` +
    `&details=${encodeURIComponent(description ?? '')}` +
    `&location=${encodeURIComponent(url)}`;

  const downloadIcs = useCallback(() => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Rabble//EN',
      'BEGIN:VEVENT',
      `UID:${spaceId}@rabble`,
      `DTSTAMP:${formatDate(new Date())}`,
      `DTSTART:${formatDate(start)}`,
      `DTEND:${formatDate(end)}`,
      `SUMMARY:${escapeIcs(title)}`,
      `DESCRIPTION:${escapeIcs(description ?? '')}`,
      `LOCATION:${escapeIcs(url)}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `${title.replace(/[^\w]+/g, '-').slice(0, 40) || 'show'}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  }, [description, end, spaceId, start, title, url]);

  return (
    <div className="relative" data-testid="add-to-calendar">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text)] hover:bg-[var(--color-ink-muted)]"
        data-testid="add-to-calendar-trigger"
      >
        Add to calendar
      </button>
      {open ? (
        <div
          ref={menuRef}
          className="absolute left-0 top-full z-20 mt-2 w-56 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-sm shadow-lg"
          data-testid="add-to-calendar-menu"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block rounded-md px-2 py-1.5 text-[var(--color-text)] hover:bg-[var(--color-ink-muted)]"
            data-testid="calendar-google"
          >
            Google Calendar
          </a>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              downloadIcs();
            }}
            className="block w-full rounded-md px-2 py-1.5 text-left text-[var(--color-text)] hover:bg-[var(--color-ink-muted)]"
            data-testid="calendar-ics"
          >
            Download .ics
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default AddToCalendar;
