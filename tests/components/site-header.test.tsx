// tests/components/site-header.test.tsx
//
// Guards the 44px touch target on the brand link in the global header.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SiteHeader } from '@/components/SiteHeader';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ status: 401, json: async () => null });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('<SiteHeader />', () => {
  it('keeps the brand link at a 44px touch target', () => {
    render(<SiteHeader />);
    const className = screen.getByTestId('site-brand').className;
    expect(className).toContain('min-h-touch');
    expect(className).toContain('min-w-touch');
  });
});
