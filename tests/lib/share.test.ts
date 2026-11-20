// tests/lib/share.test.ts

import { describe, it, expect } from 'vitest';
import { buildBlueskyShareHref } from '@/lib/share';

describe('buildBlueskyShareHref', () => {
  it('builds a bsky.app compose intent with the room link and title', () => {
    const shareableUrl = 'https://rabble.example/space/sp1';
    const title = 'My Space';
    const href = buildBlueskyShareHref(shareableUrl, title);
    expect(href.startsWith('https://bsky.app/intent/compose?text=')).toBe(true);
    const expected = `Tune in to my show on Rabble Radio: ${title}\n${shareableUrl}`;
    expect(href).toContain(encodeURIComponent(expected));
  });
});
