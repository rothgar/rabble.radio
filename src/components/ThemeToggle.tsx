'use client';

// src/components/ThemeToggle.tsx
//
// Appearance preference: follow the system, or force light / dark. The
// choice lives in localStorage and is applied as `data-theme` on <html>;
// src/app/layout.tsx runs the same logic inline before first paint so the
// page never flashes the wrong palette.

import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Desktop, Moon, Sun } from '@phosphor-icons/react';

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'rabble-theme';

const ORDER: ThemePreference[] = ['system', 'light', 'dark'];

const LABEL: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export function readThemePreference(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function applyThemePreference(pref: ThemePreference): void {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  try {
    if (pref === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
}

export function nextThemePreference(pref: ThemePreference): ThemePreference {
  return ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
}

export function ThemeToggle({ className = '' }: { className?: string }): ReactElement {
  const [pref, setPref] = useState<ThemePreference>('system');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage after mount
    setPref(readThemePreference());
  }, []);

  const cycle = useCallback(() => {
    setPref((current) => {
      const next = nextThemePreference(current);
      applyThemePreference(next);
      return next;
    });
  }, []);

  const Icon = pref === 'dark' ? Moon : pref === 'light' ? Sun : Desktop;

  return (
    <button
      type="button"
      onClick={cycle}
      className={`inline-flex min-h-touch min-w-touch items-center justify-center rounded-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-ink-muted)] hover:text-[var(--color-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-2)] ${className}`}
      aria-label={`Appearance: ${LABEL[pref]}. Switch to ${LABEL[nextThemePreference(pref)]}`}
      title={`Appearance: ${LABEL[pref]}`}
      data-testid="theme-toggle"
      data-theme-preference={pref}
    >
      <Icon size={20} weight="bold" aria-hidden />
    </button>
  );
}

export default ThemeToggle;
