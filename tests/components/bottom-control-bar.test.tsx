// tests/components/bottom-control-bar.test.tsx
//
// Verifies the per-role control buttons render and that every action button
// keeps a 44px minimum touch target (min-h-touch).

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BottomControlBar } from '@/components/BottomControlBar';

function baseProps() {
  return {
    micOn: true,
    onMicToggle: vi.fn(),
    onLeave: vi.fn(),
    onStepDown: vi.fn(),
    onReact: vi.fn(),
    onToggleHand: vi.fn(),
  };
}

describe('<BottomControlBar />', () => {
  it('renders the audience actions', () => {
    render(<BottomControlBar role="audience" {...baseProps()} />);
    const bar = screen.getByTestId('bottom-control-bar');
    expect(bar).toHaveAttribute('data-role', 'audience');
    expect(screen.getByTestId('bottom-bar-audience')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-bar-raise-hand')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-bar-leave')).toBeInTheDocument();
    expect(screen.getByTestId('reaction-bar')).toBeInTheDocument();
  });

  it('renders the speaker actions', () => {
    render(<BottomControlBar role="speaker" {...baseProps()} />);
    expect(screen.getByTestId('bottom-bar-speaker')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-bar-mic-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-bar-step-down')).toBeInTheDocument();
    expect(screen.getByTestId('bottom-bar-leave')).toBeInTheDocument();
    expect(screen.getByTestId('reaction-bar')).toBeInTheDocument();
  });

  it('every action button has the min-h-touch (44px) class', () => {
    render(<BottomControlBar role="speaker" {...baseProps()} />);
    const actionIds = [
      'bottom-bar-mic-toggle',
      'bottom-bar-step-down',
      'bottom-bar-leave',
    ];
    for (const id of actionIds) {
      expect(screen.getByTestId(id).className).toContain('min-h-touch');
    }
  });

  it('reaction buttons are 44px touch targets', () => {
    render(<BottomControlBar role="audience" {...baseProps()} />);
    for (const emoji of ['👍', '❤️', '😂', '🎉', '👏']) {
      expect(screen.getByTestId(`reaction-${emoji}`).className).toContain(
        'min-h-touch'
      );
    }
  });
});
