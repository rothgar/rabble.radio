// tests/lib/live.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockSetSpaceLive,
  mockEndShowSession,
  mockDeleteLiveStatus,
  mockSetAudienceSubscriptions,
  mockBroadcastRoomData,
  mockStopRecording,
  mockFindActiveRecordingForSpace,
  mockCompleteRecording,
  mockFailRecording,
} = vi.hoisted(() => ({
  mockSetSpaceLive: vi.fn(),
  mockEndShowSession: vi.fn(async () => undefined),
  mockDeleteLiveStatus: vi.fn(),
  mockSetAudienceSubscriptions: vi.fn(async () => 0),
  mockBroadcastRoomData: vi.fn(async () => true),
  mockStopRecording: vi.fn(async () => false),
  mockFindActiveRecordingForSpace: vi.fn(),
  mockCompleteRecording: vi.fn(async () => true),
  mockFailRecording: vi.fn(async () => undefined),
}));

vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/spaces', () => ({ setSpaceLive: mockSetSpaceLive }));
vi.mock('@/lib/metrics', () => ({ endShowSession: mockEndShowSession }));
vi.mock('@/lib/atproto', () => ({ deleteLiveStatus: mockDeleteLiveStatus }));
vi.mock('@/lib/livekit', () => ({
  roomNameForSpace: (id: string) => `space-${id}`,
  setAudienceSubscriptions: mockSetAudienceSubscriptions,
  broadcastRoomData: mockBroadcastRoomData,
  stopRecording: mockStopRecording,
}));
vi.mock('@/lib/recording', () => ({
  findActiveRecordingForSpace: mockFindActiveRecordingForSpace,
  completeRecording: mockCompleteRecording,
  failRecording: mockFailRecording,
}));

import { endLiveShow } from '@/lib/live';

beforeEach(() => {
  vi.clearAllMocks();
  mockSetSpaceLive.mockResolvedValue({ id: 'sp1', isLive: false });
  mockDeleteLiveStatus.mockResolvedValue({ ok: true });
  mockFindActiveRecordingForSpace.mockResolvedValue(null);
});

describe('endLiveShow', () => {
  it('flips isLive off, ends the session, deletes the status record and closes the audience', async () => {
    const out = await endLiveShow('sp1', { did: 'did:plc:host' });
    expect(mockSetSpaceLive).toHaveBeenCalledWith('sp1', false);
    expect(mockEndShowSession).toHaveBeenCalledWith({ spaceId: 'sp1' });
    expect(mockDeleteLiveStatus).toHaveBeenCalledWith({ session: { did: 'did:plc:host' } });
    expect(mockSetAudienceSubscriptions).toHaveBeenCalledWith('space-sp1', false);
    expect(mockBroadcastRoomData).toHaveBeenCalledWith('space-sp1', {
      type: 'on_air_changed',
      spaceId: 'sp1',
      onAir: false,
    });
    expect(out.atproto).toEqual({ ok: true });
    expect(out.space).toEqual({ id: 'sp1', isLive: false });
  });

  it('stops an active recording', async () => {
    mockFindActiveRecordingForSpace.mockResolvedValueOnce({ egressId: 'eg1' });
    await endLiveShow('sp1', { did: 'did:plc:host' });
    expect(mockStopRecording).toHaveBeenCalledWith('eg1');
    expect(mockCompleteRecording).toHaveBeenCalledWith('eg1');
  });

  it('marks the recording failed when it cannot be completed', async () => {
    mockFindActiveRecordingForSpace.mockResolvedValueOnce({ egressId: 'eg1' });
    mockCompleteRecording.mockResolvedValueOnce(false);
    await endLiveShow('sp1', { did: 'did:plc:host' });
    expect(mockFailRecording).toHaveBeenCalledWith('eg1');
  });

  it('swallows a recording lookup failure', async () => {
    mockFindActiveRecordingForSpace.mockRejectedValueOnce(new Error('egress down'));
    await expect(endLiveShow('sp1', { did: 'did:plc:host' })).resolves.toBeDefined();
  });
});
