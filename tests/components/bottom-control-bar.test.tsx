// tests/components/bottom-control-bar.test.tsx
//
// Verifies the per-role control buttons render and that every action button
// keeps a 44px minimum touch target (min-h-touch).

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BottomControlBar } from '@/components/BottomControlBar';
import { NocturneShell } from '@/components/NocturneShell';

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

describe('leave confirmation', () => {
  it('asks before leaving and only calls onLeave on confirm', () => {
    const props = baseProps();
    render(<BottomControlBar role="audience" {...props} />);
    fireEvent.click(screen.getByTestId('bottom-bar-leave'));
    expect(screen.getByTestId('leave-dialog')).toBeInTheDocument();
    expect(props.onLeave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('leave-dialog-stay'));
    expect(screen.queryByTestId('leave-dialog')).not.toBeInTheDocument();
    expect(props.onLeave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('bottom-bar-leave'));
    fireEvent.click(screen.getByTestId('leave-dialog-confirm'));
    expect(props.onLeave).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('leave-dialog')).not.toBeInTheDocument();
  });

  it('warns a host that leaving will end the show when they are the last one on stage', () => {
    render(<BottomControlBar role="host" {...baseProps()} lastOnStage />);
    fireEvent.click(screen.getByTestId('bottom-bar-leave'));
    expect(screen.getByTestId('leave-dialog')).toHaveTextContent(
      "You're the last one on stage. Leaving will take the show off air."
    );
  });

  it('warns a speaker that leaving will end the show when they are the last one on stage', () => {
    render(<BottomControlBar role="speaker" {...baseProps()} lastOnStage />);
    fireEvent.click(screen.getByTestId('bottom-bar-leave'));
    expect(screen.getByTestId('leave-dialog')).toHaveTextContent(
      "You're the last one on stage. Leaving will take the show off air."
    );
  });

  it('tells a host the show stays open when other hosts remain on stage', () => {
    render(<BottomControlBar role="host" {...baseProps()} lastOnStage={false} />);
    fireEvent.click(screen.getByTestId('bottom-bar-leave'));
    expect(screen.getByTestId('leave-dialog')).toHaveTextContent(
      'The show stays open and you can come back from your shows list.'
    );
  });

  it('tells a speaker the show stays open when another speaker remains on stage', () => {
    render(<BottomControlBar role="speaker" {...baseProps()} lastOnStage={false} />);
    fireEvent.click(screen.getByTestId('bottom-bar-leave'));
    expect(screen.getByTestId('leave-dialog')).toHaveTextContent(
      'The show stays open and you can come back from your shows list.'
    );
  });

  it('does not nest the fixed leave dialog inside the backdrop-blur footer', () => {
    render(
      <NocturneShell
        header={<div>header</div>}
        main={<div>main</div>}
        sidebar={<div>sidebar</div>}
        bottomBar={<BottomControlBar role="audience" {...baseProps()} />}
      />
    );
    fireEvent.click(screen.getByTestId('bottom-bar-leave'));
    const dialog = screen.getByTestId('leave-dialog');
    const footer = screen.getByTestId('nocturne-footer');
    expect(footer).not.toContainElement(dialog);
  });
});
