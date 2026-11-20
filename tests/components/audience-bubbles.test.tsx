// tests/components/audience-bubbles.test.tsx

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AudienceBubbles } from '@/components/AudienceBubbles';

afterEach(cleanup);

describe('AudienceBubbles', () => {
  it('shows the share entry as the first listener, before the local user', () => {
    render(
      <AudienceBubbles
        audience={[{ identity: 'did:plc:a', name: 'Ada', handle: 'ada.test', avatarUrl: null }]}
        localIdentity="did:plc:me"
        localName="Me"
        shareableUrl="https://rabble.example/space/sp1"
        title="My Space"
      />
    );
    const bubbles = screen.getByTestId('audience-bubbles');
    const first = bubbles.firstElementChild;
    expect(first).not.toBeNull();
    expect(first?.getAttribute('data-testid')).toBe('share-entry-bubble');
  });
});
