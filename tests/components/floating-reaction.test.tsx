// tests/components/floating-reaction.test.tsx

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FLOAT_MS, FloatingReaction } from '@/components/FloatingReaction';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('FloatingReaction', () => {
  it('shows who reacted beside the emoji and holds for the full float', () => {
    const onDone = vi.fn();
    render(<FloatingReaction id="r1" emoji="❤️" x={100} y={200} name="Ada" avatarUrl="https://cdn/a.jpg" onDone={onDone} />);
    expect(screen.getByTestId('floating-reaction-name').textContent).toBe('Ada');
    expect(screen.getByTestId('floating-reaction-emoji').textContent).toBe('❤️');
    expect(screen.getByTestId('floating-reaction-avatar').getAttribute('src')).toBe('https://cdn/a.jpg');
    const el = screen.getByTestId('floating-reaction-r1') as HTMLElement;
    expect(el.style.animation).toContain(`${FLOAT_MS}ms`);
    expect(FLOAT_MS).toBeGreaterThanOrEqual(3000);
    vi.advanceTimersByTime(FLOAT_MS - 1);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDone).toHaveBeenCalledWith('r1');
  });

  it('falls back to initials without an avatar and to a bare emoji without a name', () => {
    render(<FloatingReaction id="r2" emoji="🎉" x={0} y={0} name="@bob.test" onDone={() => undefined} />);
    expect(screen.getByTestId('floating-reaction-chip').textContent).toContain('BO');
    cleanup();
    render(<FloatingReaction id="r3" emoji="👏" x={0} y={0} onDone={() => undefined} />);
    expect(screen.queryByTestId('floating-reaction-name')).toBeNull();
    expect(screen.getByTestId('floating-reaction-emoji').textContent).toBe('👏');
  });
});
