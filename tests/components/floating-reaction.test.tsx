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
  it('shows only the emoji and holds for the full float', () => {
    const onDone = vi.fn();
    render(<FloatingReaction id="r1" emoji="❤️" x={100} y={200} onDone={onDone} />);
    expect(screen.getByTestId('floating-reaction-emoji').textContent).toBe('❤️');
    expect(screen.getByTestId('floating-reaction-chip').textContent).toBe('❤️');
    expect(screen.queryByTestId('floating-reaction-name')).toBeNull();
    expect(screen.queryByTestId('floating-reaction-avatar')).toBeNull();
    const el = screen.getByTestId('floating-reaction-r1') as HTMLElement;
    expect(el.style.animation).toContain(`${FLOAT_MS}ms`);
    expect(el.style.left).toBe('100px');
    expect(FLOAT_MS).toBeGreaterThanOrEqual(3000);
    vi.advanceTimersByTime(FLOAT_MS - 1);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDone).toHaveBeenCalledWith('r1');
  });
});
