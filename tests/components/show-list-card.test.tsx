// tests/components/show-list-card.test.tsx

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { PublicSpace } from '@/types';
import { actionFor, ShowListCard } from '@/components/ShowListCard';

afterEach(cleanup);

function show(overrides: Partial<PublicSpace>): PublicSpace {
  return {
    id: 'sp1', slug: 'sp1', title: 'Morning', description: null, isLive: false, status: 'active',
    scheduledAt: null, expiresAt: null, listenerCount: 3, speakerCount: 1, reactionCount: 0,
    likeCount: 0, sessionCount: 0, totalListeners: 0, hostedSeconds: 0, lastLiveAt: null,
    tags: [], createdAt: '', updatedAt: '', shareableUrl: '',
    host: { did: 'did:h', handle: 'host.test', displayName: 'Host', avatarUrl: null },
    replay: null, reminded: false,
    ...overrides,
  };
}

describe('actionFor', () => {
  it('picks Listen, Replay, Notify me or Open', () => {
    expect(actionFor(show({ isLive: true, status: 'live' }))).toMatchObject({ label: 'Listen', href: '/show/sp1?listen=1' });
    expect(actionFor(show({ replay: { recordingId: 'r', audioUrl: '/a', contentType: 'audio/mp4', startedAt: '', endedAt: null, durationSeconds: null, sizeBytes: null } }))).toMatchObject({ label: 'Replay' });
    expect(actionFor(show({ status: 'scheduled' }))).toMatchObject({ label: 'Notify me' });
    expect(actionFor(show({ status: 'scheduled', reminded: true }))).toMatchObject({ label: 'Notifying you' });
    expect(actionFor(show({}))).toMatchObject({ label: 'Notify me', kind: 'notify' });
    expect(actionFor(show({ status: 'ended' }))).toMatchObject({ label: 'Notify me' });
  });
});

describe('ShowListCard', () => {
  it('renders the live row with counts and a Listen link', () => {
    render(<ShowListCard space={show({ isLive: true, status: 'live' })} rank={1} />);
    expect(screen.getByTestId('show-list-action').textContent).toBe('Listen');
    expect(screen.getByText(/3 listening · 1 on stage/)).toBeTruthy();
  });

  it('shows who you follow in the room and that you follow the host', () => {
    render(
      <ShowListCard
        space={show({
          isLive: true,
          status: 'live',
          hostFollowed: true,
          followedInRoom: [
            { did: 'did:a', handle: 'a.test', displayName: 'Ada', avatarUrl: null },
            { did: 'did:b', handle: 'b.test', displayName: null, avatarUrl: null },
          ],
        })}
      />
    );
    expect(screen.getByTestId('show-list-following')).toBeTruthy();
    expect(screen.getByTestId('show-list-in-room').textContent).toContain('Ada and 1 more you follow are in the room');
  });
});
