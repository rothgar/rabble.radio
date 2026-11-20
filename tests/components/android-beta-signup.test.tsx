// tests/components/android-beta-signup.test.tsx

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AndroidBetaSignup } from '@/components/AndroidBetaSignup';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'fb1' }) });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AndroidBetaSignup', () => {
  it('sends the email as a beta category report', async () => {
    render(<AndroidBetaSignup />);
    fireEvent.change(screen.getByTestId('beta-signup-email'), { target: { value: 'alice@example.com' } });
    fireEvent.click(screen.getByTestId('beta-signup-send'));

    await waitFor(() => expect(screen.getByTestId('beta-signup-sent')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/feedback');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ category: 'beta', platform: 'android', email: 'alice@example.com' });
  });

  it('shows the server error message when sending fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'validation_error', message: 'Email must be a valid address.' }),
    });
    render(<AndroidBetaSignup />);
    fireEvent.change(screen.getByTestId('beta-signup-email'), { target: { value: 'nope@host' } });
    fireEvent.click(screen.getByTestId('beta-signup-send'));
    await waitFor(() =>
      expect(screen.getByTestId('beta-signup-error').textContent).toBe('Email must be a valid address.')
    );
    expect(screen.queryByTestId('beta-signup-sent')).toBeNull();
  });
});
