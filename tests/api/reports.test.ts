// tests/api/reports.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetCurrentUser,
  mockGetSpaceById,
  mockGetSpaceBySlug,
  mockCreateReport,
  mockListReports,
  mockIsAdmin,
  mockListActiveSpeakers,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockGetSpaceById: vi.fn(),
  mockGetSpaceBySlug: vi.fn(),
  mockCreateReport: vi.fn(),
  mockListReports: vi.fn(),
  mockIsAdmin: vi.fn(),
  mockListActiveSpeakers: vi.fn(),
}));

vi.mock('@/lib/session', () => ({ getCurrentUser: mockGetCurrentUser }));
vi.mock('@/lib/spaces', () => ({
  getSpaceById: mockGetSpaceById,
  getSpaceBySlug: mockGetSpaceBySlug,
}));
vi.mock('@/lib/stage', () => ({ listActiveSpeakers: mockListActiveSpeakers }));
vi.mock('@/lib/reports', async () => {
  const actual = await vi.importActual<typeof import('@/lib/reports')>('@/lib/reports');
  return {
    ...actual,
    createReport: mockCreateReport,
    listReports: mockListReports,
    isReportAdmin: mockIsAdmin,
  };
});
vi.mock('@/lib/db', () => ({ prisma: {} }));

import { ReportValidationError } from '@/lib/reports';
import { GET, POST } from '@/app/api/reports/route';

function post(body: unknown): Promise<Response> {
  return POST(
    new NextRequest('http://localhost/api/reports', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCurrentUser.mockResolvedValue(null);
  mockGetSpaceById.mockResolvedValue(null);
  mockGetSpaceBySlug.mockResolvedValue(null);
  mockListActiveSpeakers.mockResolvedValue(['did:plc:guest']);
  mockCreateReport.mockImplementation(async (input) => ({
    id: 'r1',
    spaceId: input.spaceId,
    reportedDid: input.reportedDid,
  }));
});

describe('POST /api/reports', () => {
  it('requires a session', async () => {
    const res = await post({ spaceId: 'sp1', targetIdentity: 'did:plc:guest', reason: 'bad' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when spaceId or targetIdentity is missing', async () => {
    mockGetCurrentUser.mockResolvedValue({ did: 'did:plc:host', handle: 'host.test' });
    expect((await post({ reason: 'bad' })).status).toBe(400);
    expect((await post('{nope')).status).toBe(400);
  });

  it('returns 404 when the space does not exist', async () => {
    mockGetCurrentUser.mockResolvedValue({ did: 'did:plc:host', handle: 'host.test' });
    const res = await post({ spaceId: 'sp1', targetIdentity: 'did:plc:guest', reason: 'bad' });
    expect(res.status).toBe(404);
  });

  it('returns 403 when the caller is not the host', async () => {
    mockGetCurrentUser.mockResolvedValue({ did: 'did:plc:guest', handle: 'guest.test' });
    mockGetSpaceById.mockResolvedValue({ id: 'sp1', hostId: 'did:plc:host' });
    const res = await post({ spaceId: 'sp1', targetIdentity: 'did:plc:other', reason: 'bad' });
    expect(res.status).toBe(403);
    expect(mockCreateReport).not.toHaveBeenCalled();
  });

  it('returns 400 when targetIdentity is not a current speaker', async () => {
    mockGetCurrentUser.mockResolvedValue({ did: 'did:plc:host', handle: 'host.test' });
    mockGetSpaceById.mockResolvedValue({ id: 'sp1', hostId: 'did:plc:host' });
    mockListActiveSpeakers.mockResolvedValue(['did:plc:someone-else']);
    const res = await post({ spaceId: 'sp1', targetIdentity: 'did:plc:guest', reason: 'bad' });
    expect(res.status).toBe(400);
    expect(mockCreateReport).not.toHaveBeenCalled();
  });

  it('stores the report when the caller is the host', async () => {
    mockGetCurrentUser.mockResolvedValue({ did: 'did:plc:host', handle: 'host.test' });
    mockGetSpaceById.mockResolvedValue({ id: 'sp1', hostId: 'did:plc:host' });
    const res = await post({
      spaceId: 'sp1',
      targetIdentity: 'did:plc:guest',
      targetHandle: 'guest.test',
      reason: 'Shouted slurs on air',
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'r1' });
    expect(mockCreateReport).toHaveBeenCalledWith(
      expect.objectContaining({
        spaceId: 'sp1',
        reporterDid: 'did:plc:host',
        reporterHandle: 'host.test',
        reportedDid: 'did:plc:guest',
        reportedHandle: 'guest.test',
        reason: 'Shouted slurs on air',
      })
    );
  });

  it('returns 400 on validation errors and 500 on storage failures', async () => {
    mockGetCurrentUser.mockResolvedValue({ did: 'did:plc:host', handle: 'host.test' });
    mockGetSpaceById.mockResolvedValue({ id: 'sp1', hostId: 'did:plc:host' });
    mockCreateReport.mockRejectedValueOnce(new ReportValidationError('Reason is required.'));
    const res400 = await post({ spaceId: 'sp1', targetIdentity: 'did:plc:guest', reason: '' });
    expect(res400.status).toBe(400);
    expect(await res400.json()).toEqual({ error: 'validation_error', message: 'Reason is required.' });

    mockCreateReport.mockRejectedValueOnce(new Error('d1 down'));
    const res500 = await post({ spaceId: 'sp1', targetIdentity: 'did:plc:guest', reason: 'bad' });
    expect(res500.status).toBe(500);
  });
});

describe('GET /api/reports', () => {
  const get = () => GET(new NextRequest('http://localhost/api/reports?limit=5'));

  it('requires a session and admin membership', async () => {
    expect((await get()).status).toBe(401);
    mockGetCurrentUser.mockResolvedValue({ did: 'did:plc:a', handle: 'alice.test' });
    mockIsAdmin.mockReturnValue(false);
    expect((await get()).status).toBe(403);
  });

  it('lists reports for admins', async () => {
    mockGetCurrentUser.mockResolvedValue({ did: 'did:plc:admin', handle: 'admin.test' });
    mockIsAdmin.mockReturnValue(true);
    mockListReports.mockResolvedValue([
      { id: 'r1', reason: 'x', createdAt: new Date('2026-11-19T20:00:00Z') },
    ]);
    const res = await get();
    expect(res.status).toBe(200);
    expect(mockListReports).toHaveBeenCalledWith(5);
    const body = await res.json();
    expect(body.reports[0]).toMatchObject({ id: 'r1', createdAt: '2026-11-19T20:00:00.000Z' });
  });
});
