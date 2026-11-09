// tests/components/theme-toggle.test.tsx

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { THEME_STORAGE_KEY, ThemeToggle, nextThemePreference } from '@/components/ThemeToggle';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});
afterEach(cleanup);

describe('ThemeToggle', () => {
  it('cycles system → light → dark → system and mirrors the choice on <html> and in storage', async () => {
    render(<ThemeToggle />);
    const button = screen.getByTestId('theme-toggle');
    expect(button.getAttribute('data-theme-preference')).toBe('system');

    await act(async () => { fireEvent.click(button); });
    expect(button.getAttribute('data-theme-preference')).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    await act(async () => { fireEvent.click(button); });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    await act(async () => { fireEvent.click(button); });
    expect(button.getAttribute('data-theme-preference')).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it('starts from the stored preference', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    render(<ThemeToggle />);
    expect(screen.getByTestId('theme-toggle').getAttribute('data-theme-preference')).toBe('dark');
    expect(nextThemePreference('dark')).toBe('system');
  });
});
