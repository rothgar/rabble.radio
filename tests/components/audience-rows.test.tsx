// tests/components/audience-rows.test.tsx

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AudienceRows } from '@/components/AudienceRows';

afterEach(cleanup);

const audience = [
  { identity: 'did:plc:a', name: 'Ada', handle: 'ada.test', avatarUrl: null },
  { identity: 'did:plc:b', name: 'Bob', handle: 'bob.test', avatarUrl: null, handRaised: true },
  { identity: 'did:plc:c', name: 'Cy', handle: 'cy.test', avatarUrl: null, handRaised: true },
];

describe('AudienceRows', () => {
  it('groups raised hands first with their own heading and an invite button', () => {
    const onInvite = vi.fn();
    render(<AudienceRows audience={audience} invitedSet={new Set(['did:plc:c'])} onInvite={onInvite} />);
    const raised = screen.getByTestId('raised-hands');
    expect(raised.getAttribute('data-count')).toBe('2');
    expect(raised.textContent).toContain('Raised hands · 2');
    expect(raised.querySelector('[data-testid="audience-row-did:plc:b"]')).not.toBeNull();
    expect(raised.querySelector('[data-testid="audience-row-did:plc:a"]')).toBeNull();
    expect(screen.getByTestId('audience-hand-did:plc:b')).toBeInTheDocument();
    expect(screen.queryByTestId('audience-hand-did:plc:a')).toBeNull();
    expect(screen.getByTestId('audience-invited-did:plc:c')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('audience-invite-did:plc:b'));
    expect(onInvite).toHaveBeenCalledWith('did:plc:b');
  });

  it('omits the raised-hands group when nobody has a hand up', () => {
    render(<AudienceRows audience={[audience[0]]} invitedSet={new Set()} onInvite={() => undefined} />);
    expect(screen.queryByTestId('raised-hands')).toBeNull();
    expect(screen.getByTestId('audience-rows').getAttribute('data-count')).toBe('1');
  });
});
