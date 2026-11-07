// tests/components/handle-input.test.tsx

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { HandleInput, TYPEAHEAD_DEBOUNCE_MS } from '@/components/HandleInput';
import type { ActorSuggestion } from '@/lib/bluesky-typeahead';

const search = vi.hoisted(() => vi.fn());
vi.mock('@/lib/bluesky-typeahead', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bluesky-typeahead')>();
  return { ...actual, searchActorsTypeahead: search };
});

const ADA: ActorSuggestion = {
  did: 'did:plc:a',
  handle: 'ada.bsky.social',
  displayName: 'Ada',
  avatar: 'https://cdn/a.jpg',
};
const BOB: ActorSuggestion = { did: 'did:plc:b', handle: 'bob.example.com', displayName: null, avatar: null };

function Harness({ onPick }: { onPick?: (s: ActorSuggestion) => void }): ReactElement {
  const [value, setValue] = useState('');
  return (
    <>
      <HandleInput id="h" value={value} onChange={setValue} onPick={onPick} />
      <output data-testid="value">{value}</output>
    </>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  search.mockReset();
  search.mockResolvedValue([ADA, BOB]);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function type(text: string): Promise<void> {
  fireEvent.change(screen.getByTestId('handle-input'), { target: { value: text } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(TYPEAHEAD_DEBOUNCE_MS + 1);
  });
}

describe('HandleInput', () => {
  it('sets the attributes browsers and password managers autofill from', () => {
    render(<Harness />);
    const input = screen.getByTestId('handle-input') as HTMLInputElement;
    expect(input.name).toBe('handle');
    expect(input.getAttribute('autocomplete')).toBe('username');
    expect(input.getAttribute('autocapitalize')).toBe('none');
    expect(input.getAttribute('autocorrect')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
    expect(input.getAttribute('role')).toBe('combobox');
  });

  it('debounces typing into one typeahead request and lists accounts', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByTestId('handle-input'), { target: { value: 'a' } });
    fireEvent.change(screen.getByTestId('handle-input'), { target: { value: 'ad' } });
    await type('ada');
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0]).toBe('ada');
    const items = screen.getAllByTestId('handle-suggestion');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Ada');
    expect(items[0].textContent).toContain('@ada.bsky.social');
    expect(items[0].querySelector('img')?.getAttribute('src')).toBe('https://cdn/a.jpg');
    // No avatar: initials fallback.
    expect(items[1].querySelector('img')).toBeNull();
    expect(items[1].textContent).toContain('bo');
  });

  it('fills the handle on click and does not re-query the picked value', async () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);
    await type('ada');
    fireEvent.click(screen.getAllByTestId('handle-suggestion')[0]);
    expect(screen.getByTestId('value').textContent).toBe('ada.bsky.social');
    expect(onPick).toHaveBeenCalledWith(ADA);
    expect(screen.queryByTestId('handle-suggestions')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TYPEAHEAD_DEBOUNCE_MS + 1);
    });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('supports arrow keys, Enter and Escape', async () => {
    render(<Harness />);
    await type('b');
    const input = screen.getByTestId('handle-input');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const items = screen.getAllByTestId('handle-suggestion');
    expect(items[1].getAttribute('aria-selected')).toBe('true');
    expect(input.getAttribute('aria-activedescendant')).toBe(items[1].id);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(items[0].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByTestId('handle-suggestions')).toBeNull();
    fireEvent.focus(input);
    expect(screen.getByTestId('handle-suggestions')).toBeTruthy();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('value').textContent).toBe('ada.bsky.social');
  });

  it('closes the list when the field is cleared and survives lookup failures', async () => {
    render(<Harness />);
    await type('ada');
    expect(screen.getByTestId('handle-suggestions')).toBeTruthy();
    await type('');
    expect(screen.queryByTestId('handle-suggestions')).toBeNull();
    search.mockRejectedValueOnce(new Error('offline'));
    await type('zed');
    expect(search).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('handle-suggestions')).toBeNull();
    expect(screen.getByTestId('value').textContent).toBe('zed');
  });
});
