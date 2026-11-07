// tests/app/login-page.test.tsx
//
// The sign-in form: prefills the remembered handle, strips a leading @,
// remembers the handle on submit and hands off to the OAuth start route.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import LoginPage from '@/app/login/page';
import { LAST_HANDLE_KEY } from '@/lib/bluesky-typeahead';

const nav = vi.hoisted(() => ({ next: null as string | null }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (k: string) => (k === 'next' ? nav.next : null) }),
}));
vi.mock('@/lib/bluesky-typeahead', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bluesky-typeahead')>();
  return { ...actual, searchActorsTypeahead: vi.fn().mockResolvedValue([]) };
});

let assigned: string | null;

beforeEach(() => {
  assigned = null;
  nav.next = null;
  window.localStorage.clear();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      origin: 'https://rabble.rodeo',
      set href(v: string) {
        assigned = v;
      },
    },
  });
});
afterEach(() => cleanup());

describe('LoginPage', () => {
  it('prefills the handle remembered from last time', async () => {
    window.localStorage.setItem(LAST_HANDLE_KEY, 'ada.bsky.social');
    await act(async () => {
      render(<LoginPage />);
    });
    expect((screen.getByTestId('handle-input') as HTMLInputElement).value).toBe('ada.bsky.social');
  });

  it('remembers the handle, strips @ and redirects to the OAuth start with next', async () => {
    nav.next = '/me';
    await act(async () => {
      render(<LoginPage />);
    });
    fireEvent.change(screen.getByTestId('handle-input'), { target: { value: '@bob.example.com' } });
    fireEvent.submit(screen.getByTestId('login-submit').closest('form') as HTMLFormElement);
    expect(window.localStorage.getItem(LAST_HANDLE_KEY)).toBe('bob.example.com');
    expect(assigned).toBe('https://rabble.rodeo/api/auth/bluesky?handle=bob.example.com&next=%2Fme');
    expect(screen.getByTestId('login-submit').textContent).toMatch(/redirecting/i);
  });
});
