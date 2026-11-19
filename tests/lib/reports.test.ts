// tests/lib/reports.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCreate, mockFindMany } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: { report: { create: mockCreate, findMany: mockFindMany } },
}));

import {
  createReport,
  isReportAdmin,
  listReports,
  REPORT_REASON_MAX,
  reportAdmins,
  ReportValidationError,
} from '@/lib/reports';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    spaceId: 'sp1',
    reporterDid: 'did:plc:host',
    reporterHandle: 'host.test',
    reportedDid: 'did:plc:guest',
    reportedHandle: 'guest.test',
    reason: 'Shouted slurs on air',
    createdAt: '2026-11-19T20:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockImplementation(async ({ data }) => row({ ...data, id: 'r-new' }));
});

describe('createReport', () => {
  it('stores the report and returns the row', async () => {
    const out = await createReport({
      spaceId: 'sp1',
      reporterDid: 'did:plc:host',
      reporterHandle: 'host.test',
      reportedDid: 'did:plc:guest',
      reportedHandle: 'guest.test',
      reason: '  Shouted slurs on air  ',
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        spaceId: 'sp1',
        reporterDid: 'did:plc:host',
        reportedDid: 'did:plc:guest',
        reason: 'Shouted slurs on air',
      }),
    });
    expect(out.id).toBe('r-new');
    expect(out.createdAt).toBeInstanceOf(Date);
  });

  it('rejects a missing spaceId, reporterDid, reportedDid or reason', async () => {
    const base = {
      spaceId: 'sp1',
      reporterDid: 'did:plc:host',
      reportedDid: 'did:plc:guest',
      reason: 'bad',
    };
    await expect(createReport({ ...base, spaceId: '' })).rejects.toBeInstanceOf(
      ReportValidationError
    );
    await expect(createReport({ ...base, reporterDid: '' })).rejects.toBeInstanceOf(
      ReportValidationError
    );
    await expect(createReport({ ...base, reportedDid: '' })).rejects.toBeInstanceOf(
      ReportValidationError
    );
    await expect(createReport({ ...base, reason: '   ' })).rejects.toBeInstanceOf(
      ReportValidationError
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects an oversized reason', async () => {
    await expect(
      createReport({
        spaceId: 'sp1',
        reporterDid: 'did:plc:host',
        reportedDid: 'did:plc:guest',
        reason: 'x'.repeat(REPORT_REASON_MAX + 1),
      })
    ).rejects.toThrow(new RegExp(String(REPORT_REASON_MAX)));
  });
});

describe('listReports', () => {
  it('returns newest first', async () => {
    mockFindMany.mockResolvedValue([row(), row({ id: 'r2' })]);
    const out = await listReports(10);
    expect(mockFindMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' }, take: 10 });
    expect(out.map((r) => r.id)).toEqual(['r1', 'r2']);
  });
});

describe('reportAdmins / isReportAdmin', () => {
  it('matches DIDs and handles from REPORT_ADMIN_DIDS, case-insensitively', () => {
    const env = { REPORT_ADMIN_DIDS: 'did:plc:admin, @Justin.Test' };
    expect(reportAdmins(env)).toEqual(new Set(['did:plc:admin', 'justin.test']));
    expect(isReportAdmin({ did: 'did:plc:admin', handle: 'x' }, env)).toBe(true);
    expect(isReportAdmin({ did: 'did:plc:other', handle: 'justin.test' }, env)).toBe(true);
    expect(isReportAdmin({ did: 'did:plc:other', handle: 'bob' }, env)).toBe(false);
    expect(isReportAdmin(null, env)).toBe(false);
    expect(isReportAdmin({ did: 'did:plc:admin', handle: 'x' }, {})).toBe(false);
  });
});
