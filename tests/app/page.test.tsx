import { describe, it, expect, vi } from 'vitest';

const { mockRedirect } = vi.hoisted(() => ({ mockRedirect: vi.fn() }));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

import HomePage from '@/app/page';

describe('HomePage', () => {
  it('redirects to /stations', () => {
    HomePage();
    expect(mockRedirect).toHaveBeenCalledWith('/stations');
  });
});
