// tests/components/feedback-button.test.tsx

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FeedbackButton } from '@/components/FeedbackButton';
import { SiteHeader } from '@/components/SiteHeader';
import { recordError, resetDiagnosticsForTests, setRoomSnapshot } from '@/lib/diagnostics';

const fetchMock = vi.fn();

beforeEach(() => {
  resetDiagnosticsForTests();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'fb1' }) });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('FeedbackButton', () => {
  it('opens the dialog and refuses an empty message', () => {
    render(<FeedbackButton />);
    fireEvent.click(screen.getByTestId('feedback-button'));
    expect(screen.getByTestId('feedback-dialog')).toBeTruthy();
    fireEvent.click(screen.getByTestId('feedback-send'));
    expect(screen.getByTestId('feedback-error').textContent).toMatch(/what happened/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the message with captured diagnostics and shows a thank-you', async () => {
    setRoomSnapshot({
      spaceId: 'sp1',
      role: 'audience',
      connected: true,
      onAir: true,
      micOn: false,
      participants: 3,
      speakers: 1,
    });
    recordError('console', 'something exploded');
    render(<FeedbackButton variant="icon" spaceId="sp1" />);
    fireEvent.click(screen.getByTestId('feedback-button'));
    fireEvent.change(screen.getByTestId('feedback-category'), { target: { value: 'idea' } });
    fireEvent.change(screen.getByTestId('feedback-message'), { target: { value: 'No audio after on air' } });
    fireEvent.click(screen.getByTestId('feedback-send'));

    await waitFor(() => expect(screen.getByTestId('feedback-sent')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/feedback');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      message: 'No audio after on air',
      category: 'idea',
      platform: 'web',
      spaceId: 'sp1',
    });
    expect(body.context.room).toMatchObject({ spaceId: 'sp1', onAir: true, participants: 3 });
    expect(body.context.recentErrors[0].message).toBe('something exploded');
    expect(typeof body.context.userAgent).toBe('string');
    expect(body.context.viewport).toHaveProperty('width');
  });

  it('shows the server error message when sending fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'feedback_failed', message: 'Could not save your report.' }),
    });
    render(<FeedbackButton />);
    fireEvent.click(screen.getByTestId('feedback-button'));
    fireEvent.change(screen.getByTestId('feedback-message'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByTestId('feedback-send'));
    await waitFor(() =>
      expect(screen.getByTestId('feedback-error').textContent).toBe('Could not save your report.')
    );
  });

  it('does not nest the fixed dialog inside the backdrop-blur site header', () => {
    render(<SiteHeader />);
    fireEvent.click(screen.getByTestId('feedback-button'));
    const dialog = screen.getByTestId('feedback-dialog-backdrop');
    const header = screen.getByTestId('site-header');
    expect(header).not.toContainElement(dialog);
  });
});
