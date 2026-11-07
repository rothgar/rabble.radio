// tests/app/admin-feedback-page.test.tsx

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { mockGetCurrentUser, mockListFeedback, mockIsAdmin, mockNotFound } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockListFeedback: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@/lib/session', () => ({ getCurrentUser: mockGetCurrentUser }));
vi.mock('@/lib/feedback', () => ({ listFeedback: mockListFeedback, isFeedbackAdmin: mockIsAdmin }));
vi.mock('next/navigation', () => ({ notFound: mockNotFound }));
vi.mock('@/components/SiteHeader', () => ({ SiteHeader: () => <header data-testid="site-header" /> }));

import AdminFeedbackPage from '@/app/admin/feedback/page';

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  mockGetCurrentUser.mockResolvedValue({ did: 'did:plc:admin', handle: 'admin.test' });
});

describe('/admin/feedback', () => {
  it('404s for non-admins', async () => {
    mockIsAdmin.mockReturnValue(false);
    await expect(AdminFeedbackPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockListFeedback).not.toHaveBeenCalled();
  });

  it('renders reports with message, meta and captured state', async () => {
    mockIsAdmin.mockReturnValue(true);
    mockListFeedback.mockResolvedValue([
      {
        id: 'fb1',
        did: 'did:plc:a',
        handle: 'alice.test',
        category: 'problem',
        message: 'No audio',
        platform: 'android',
        appVersion: '0.1.0',
        page: 'show/sp1',
        spaceId: 'sp1',
        userAgent: 'okhttp/4',
        context: { room: { onAir: true } },
        createdAt: new Date('2026-11-06T20:00:00Z'),
      },
    ]);
    render(await AdminFeedbackPage());
    expect(screen.getByTestId('feedback-list')).toBeTruthy();
    expect(screen.getByTestId('feedback-message').textContent).toBe('No audio');
    expect(screen.getByText('@alice.test')).toBeTruthy();
    expect(screen.getByText('android')).toBeTruthy();
    expect(screen.getByText(/"onAir": true/)).toBeTruthy();
  });

  it('shows an empty state', async () => {
    mockIsAdmin.mockReturnValue(true);
    mockListFeedback.mockResolvedValue([]);
    render(await AdminFeedbackPage());
    expect(screen.getByTestId('feedback-empty')).toBeTruthy();
  });
});
