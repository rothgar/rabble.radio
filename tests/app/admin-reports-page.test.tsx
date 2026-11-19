// tests/app/admin-reports-page.test.tsx

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const { mockGetCurrentUser, mockListReports, mockIsAdmin, mockNotFound } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockListReports: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@/lib/session', () => ({ getCurrentUser: mockGetCurrentUser }));
vi.mock('@/lib/reports', () => ({ listReports: mockListReports, isReportAdmin: mockIsAdmin }));
vi.mock('next/navigation', () => ({ notFound: mockNotFound }));
vi.mock('@/components/SiteHeader', () => ({ SiteHeader: () => <header data-testid="site-header" /> }));

import AdminReportsPage from '@/app/admin/reports/page';

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  mockGetCurrentUser.mockResolvedValue({ did: 'did:plc:admin', handle: 'admin.test' });
});

describe('/admin/reports', () => {
  it('404s for non-admins', async () => {
    mockIsAdmin.mockReturnValue(false);
    await expect(AdminReportsPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockListReports).not.toHaveBeenCalled();
  });

  it('renders reports with reason and reporter/reported identities', async () => {
    mockIsAdmin.mockReturnValue(true);
    mockListReports.mockResolvedValue([
      {
        id: 'r1',
        spaceId: 'sp1',
        reporterDid: 'did:plc:host',
        reporterHandle: 'host.test',
        reportedDid: 'did:plc:guest',
        reportedHandle: 'guest.test',
        reason: 'Shouted slurs on air',
        createdAt: new Date('2026-11-19T20:00:00Z'),
      },
    ]);
    render(await AdminReportsPage());
    expect(screen.getByTestId('report-list')).toBeTruthy();
    expect(screen.getByTestId('report-reason').textContent).toBe('Shouted slurs on air');
    expect(screen.getByText('@guest.test')).toBeTruthy();
    expect(screen.getByText('@host.test')).toBeTruthy();
  });

  it('shows an empty state', async () => {
    mockIsAdmin.mockReturnValue(true);
    mockListReports.mockResolvedValue([]);
    render(await AdminReportsPage());
    expect(screen.getByTestId('report-empty')).toBeTruthy();
  });
});
