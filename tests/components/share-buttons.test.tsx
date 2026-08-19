// tests/components/share-buttons.test.tsx
//
// Exercises the share buttons client component. Verifies that:
// - Bluesky link points at the bsky.app intent endpoint with the expected
//   encoded text body.
// - A Copy link button is also rendered for clipboard copying.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShareButtons } from '@/components/ShareButtons';

describe('<ShareButtons />', () => {
  const shareableUrl = 'https://rabble.example/space/sp1';
  const title = 'My Space';

  it('renders the Bluesky share button and the Copy link button', () => {
    render(<ShareButtons shareableUrl={shareableUrl} title={title} />);
    expect(screen.getByTestId('share-bluesky-button')).toBeInTheDocument();
    expect(screen.getByTestId('share-copy-button')).toBeInTheDocument();
  });

  it('points at the bsky.app intent with the expected text', () => {
    render(<ShareButtons shareableUrl={shareableUrl} title={title} />);
    const link = screen.getByTestId('share-bluesky-button');
    const href = link.getAttribute('href') ?? '';
    expect(href.startsWith('https://bsky.app/intent/compose?text=')).toBe(true);
    const expected = `Join my space on Rabble: ${title}\n${shareableUrl}`;
    expect(href).toContain(encodeURIComponent(expected));
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('exposes shareableUrl on the Copy link button for tests', () => {
    render(<ShareButtons shareableUrl={shareableUrl} title={title} />);
    const btn = screen.getByTestId('share-copy-button');
    expect(btn.getAttribute('data-share-url')).toBe(shareableUrl);
  });
});
