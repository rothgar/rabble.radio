'use client';

// src/components/HandleInput.tsx
//
// The sign-in handle field. Three layers of completion: browser and
// password-manager autofill (name + autoComplete="username"), the handle
// remembered from the last attempt, and a live dropdown of Bluesky accounts
// from the public typeahead endpoint with avatars.

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import { searchActorsTypeahead, type ActorSuggestion } from '@/lib/bluesky-typeahead';

export const TYPEAHEAD_DEBOUNCE_MS = 200;

interface HandleInputProps {
  id: string;
  value: string;
  onChange: (handle: string) => void;
  /** Called when the user picks a suggestion (click, tap or Enter). */
  onPick?: (suggestion: ActorSuggestion) => void;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function HandleInput({
  id,
  value,
  onChange,
  onPick,
  autoFocus = false,
  disabled = false,
}: HandleInputProps): ReactElement {
  const listId = useId();
  const [suggestions, setSuggestions] = useState<ActorSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Set when the current value came from a pick, so we don't re-query it.
  const pickedRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const q = value.trim().replace(/^@/, '');
    if (!q || q === pickedRef.current) {
      abortRef.current?.abort();
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      searchActorsTypeahead(q, { signal: controller.signal })
        .then((actors) => {
          if (controller.signal.aborted) return;
          setSuggestions(actors);
          setOpen(actors.length > 0);
          setActive(-1);
        })
        .catch(() => {
          // Network hiccup or abort: keep whatever is showing, the user can
          // still type the full handle.
        });
    }, TYPEAHEAD_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const pick = (s: ActorSuggestion) => {
    pickedRef.current = s.handle;
    onChange(s.handle);
    setSuggestions([]);
    setOpen(false);
    setActive(-1);
    onPick?.(s);
  };

  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    pickedRef.current = null;
    onChange(e.target.value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(suggestions[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div className="relative">
      <input
        id={id}
        name="handle"
        type="text"
        value={value}
        onChange={onInput}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder="alice.bsky.social"
        autoFocus={autoFocus}
        disabled={disabled}
        required
        pattern="[a-zA-Z0-9._-]+"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        inputMode="url"
        enterKeyHint="go"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        data-testid="handle-input"
        className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          data-testid="handle-suggestions"
          className="absolute left-0 right-0 z-10 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.did}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              data-testid="handle-suggestion"
              // mousedown fires before the input's blur, so prevent it from
              // stealing focus and closing the list before the click lands.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
              onMouseEnter={() => setActive(i)}
              className={
                'flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 ' +
                (i === active ? 'bg-slate-800' : '')
              }
            >
              {s.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.avatar}
                  alt=""
                  width={32}
                  height={32}
                  loading="lazy"
                  className="h-8 w-8 shrink-0 rounded-full bg-slate-800 object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold uppercase text-slate-300">
                  {s.handle.slice(0, 2)}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-slate-100">
                  {s.displayName ?? s.handle}
                </span>
                <span className="block truncate text-xs text-slate-400">@{s.handle}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default HandleInput;
