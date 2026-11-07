// tests/lib/push.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  reminderFindMany: vi.fn(),
  reminderUpdateMany: vi.fn(),
  buildPushPayload: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    pushSubscription: {
      upsert: m.upsert,
      deleteMany: m.deleteMany,
      count: m.count,
      findMany: m.findMany,
      update: m.update,
    },
    showReminder: { findMany: m.reminderFindMany, updateMany: m.reminderUpdateMany },
  },
}));
vi.mock('@block65/webcrypto-web-push', () => ({ buildPushPayload: m.buildPushPayload }));

import {
  parseSubscription,
  pushRemindersOnAir,
  PushValidationError,
  saveSubscription,
  sendPushToUser,
  sendToSubscription,
  vapidConfig,
} from '@/lib/push';

const ENV = { VAPID_SUBJECT: 'mailto:x@y', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' };
const SUB = { id: 's1', endpoint: 'https://push.example/abc', p256dh: 'p', auth: 'a', failures: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  m.buildPushPayload.mockResolvedValue({ method: 'POST', headers: {}, body: new Uint8Array() });
  m.update.mockResolvedValue({});
  m.deleteMany.mockResolvedValue({ count: 1 });
});

describe('vapidConfig / parseSubscription', () => {
  it('requires all three VAPID values', () => {
    expect(vapidConfig(ENV)).toEqual({ subject: 'mailto:x@y', publicKey: 'pub', privateKey: 'priv' });
    expect(vapidConfig({ VAPID_PUBLIC_KEY: 'pub' })).toBeNull();
  });

  it('validates browser subscriptions', () => {
    expect(() => parseSubscription({ endpoint: 'http://x' })).toThrow(PushValidationError);
    expect(() => parseSubscription({ endpoint: 'https://x', keys: { p256dh: 'p' } })).toThrow(PushValidationError);
    expect(parseSubscription({ endpoint: 'https://x', keys: { p256dh: 'p', auth: 'a' }, expirationTime: 5 })).toEqual({
      endpoint: 'https://x',
      keys: { p256dh: 'p', auth: 'a' },
      expirationTime: 5,
    });
  });
});

describe('saveSubscription', () => {
  it('upserts by endpoint and re-owns it for the current user', async () => {
    m.upsert.mockResolvedValue({ id: 's1' });
    const out = await saveSubscription('did:a', { endpoint: 'https://x', keys: { p256dh: 'p', auth: 'a' } }, 'UA');
    expect(out).toEqual({ id: 's1' });
    expect(m.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { endpoint: 'https://x' },
        update: { did: 'did:a', p256dh: 'p', auth: 'a', userAgent: 'UA', failures: 0 },
      })
    );
  });
});

describe('sendToSubscription', () => {
  it('encrypts with the library, POSTs to the endpoint and records success', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 })) as unknown as typeof fetch;
    const ok = await sendToSubscription(SUB, { title: 'T', body: 'B', url: 'https://r/show/1', tag: 'rabble-1' }, ENV, fetchImpl);
    expect(ok).toBe(true);
    expect(m.buildPushPayload).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: 'T' }) }),
      { endpoint: SUB.endpoint, expirationTime: null, keys: { p256dh: 'p', auth: 'a' } },
      { subject: 'mailto:x@y', publicKey: 'pub', privateKey: 'priv' }
    );
    expect(fetchImpl).toHaveBeenCalledWith(SUB.endpoint, expect.objectContaining({ method: 'POST' }));
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ failures: 0 }) }));
  });

  it('deletes the subscription when the push service says it is gone', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 410 })) as unknown as typeof fetch;
    expect(await sendToSubscription(SUB, { title: 'T', body: 'B', url: 'u' }, ENV, fetchImpl)).toBe(false);
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { id: 's1' } });
  });

  it('counts failures and drops the row at the limit', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    expect(await sendToSubscription(SUB, { title: 'T', body: 'B', url: 'u' }, ENV, fetchImpl)).toBe(false);
    expect(m.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { failures: 1 } });
    expect(await sendToSubscription({ ...SUB, failures: 4 }, { title: 'T', body: 'B', url: 'u' }, ENV, fetchImpl)).toBe(false);
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { id: 's1' } });
  });

  it('is a no-op without VAPID configuration', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    expect(await sendToSubscription(SUB, { title: 'T', body: 'B', url: 'u' }, {}, fetchImpl)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('sendPushToUser / pushRemindersOnAir', () => {
  it('fans out to every browser of the user', async () => {
    m.findMany.mockResolvedValue([SUB, { ...SUB, id: 's2', endpoint: 'https://push.example/def' }]);
    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 })) as unknown as typeof fetch;
    expect(await sendPushToUser('did:a', { title: 'T', body: 'B', url: 'u' }, ENV, fetchImpl)).toBe(2);
  });

  it('pushes to reminder holders and marks only the delivered ones notified', async () => {
    m.reminderFindMany.mockResolvedValue([{ did: 'did:a' }, { did: 'did:b' }]);
    m.findMany.mockImplementation(async ({ where }: { where: { did: string } }) =>
      where.did === 'did:a' ? [SUB] : []
    );
    const fetchImpl = vi.fn(async () => new Response(null, { status: 201 })) as unknown as typeof fetch;
    const out = await pushRemindersOnAir(
      { id: 'sp1', title: 'Morning', host: { handle: 'h.test', displayName: 'Host' } },
      'https://rabble.rodeo',
      ENV,
      fetchImpl
    );
    expect(out).toEqual({ users: 2, delivered: 1 });
    expect(m.buildPushPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { title: 'Morning is on air', body: 'Host just went live on Rabble Radio.', url: 'https://rabble.rodeo/show/sp1', tag: 'rabble-sp1' },
      }),
      expect.anything(),
      expect.anything()
    );
    expect(m.reminderUpdateMany).toHaveBeenCalledWith({
      where: { spaceId: 'sp1', did: { in: ['did:a'] } },
      data: { notifiedAt: expect.any(Date) },
    });
  });

  it('never throws', async () => {
    m.reminderFindMany.mockRejectedValue(new Error('d1 down'));
    expect(await pushRemindersOnAir({ id: 'sp1', title: 'T', host: { handle: 'h' } }, 'o', ENV)).toEqual({ users: 0, delivered: 0 });
  });
});
