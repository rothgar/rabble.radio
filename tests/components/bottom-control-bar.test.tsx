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

  it('anonymous listeners get a sign-in link instead of raise hand', () => {
    render(
      <BottomControlBar
        role="audience"
        anonymous
        signInHref="/login?next=%2Fshow%2Fsp1"
        {...baseProps()}
      />
    );
    const bar = screen.getByTestId('bottom-control-bar');
    expect(bar).toHaveAttribute('data-anonymous', 'true');
    expect(screen.queryByTestId('bottom-bar-raise-hand')).not.toBeInTheDocument();
    const link = screen.getByTestId('bottom-bar-signin');
    expect(link).toHaveAttribute('href', '/login?next=%2Fshow%2Fsp1');
    expect(link.className).toContain('min-h-touch');
    expect(screen.getByTestId('bottom-bar-leave')).toBeInTheDocument();
  });

  it('shows the on-air toggle to the host and reflects the state', () => {
    const onToggleOnAir = vi.fn();
    const { rerender } = render(
      <BottomControlBar role="host" {...baseProps()} onAir={false} onToggleOnAir={onToggleOnAir} />
    );
    const btn = screen.getByTestId('bottom-bar-on-air');
    expect(btn).toHaveTextContent('On air');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn.className).toContain('min-h-touch');
    btn.click();
    expect(onToggleOnAir).toHaveBeenCalledTimes(1);

    rerender(
      <BottomControlBar role="host" {...baseProps()} onAir onToggleOnAir={onToggleOnAir} />
    );
    expect(screen.getByTestId('bottom-bar-on-air')).toHaveTextContent('Go off air');
    expect(screen.getByTestId('bottom-control-bar')).toHaveAttribute('data-on-air', 'true');
  });

  it('disables the on-air toggle while a request is in flight', () => {
    render(
      <BottomControlBar role="host" {...baseProps()} onAir={false} onToggleOnAir={vi.fn()} onAirBusy />
    );
    expect(screen.getByTestId('bottom-bar-on-air')).toBeDisabled();
  });

  it('never shows the on-air toggle to speakers or the audience', () => {
    const { rerender } = render(
      <BottomControlBar role="speaker" {...baseProps()} onAir={false} onToggleOnAir={vi.fn()} />
    );
    expect(screen.queryByTestId('bottom-bar-on-air')).toBeNull();
    rerender(
      <BottomControlBar role="audience" {...baseProps()} onAir={false} onToggleOnAir={vi.fn()} />
    );
    expect(screen.queryByTestId('bottom-bar-on-air')).toBeNull();
  });
});
