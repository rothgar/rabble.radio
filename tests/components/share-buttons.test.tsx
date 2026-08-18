// tests/components/share-buttons.test.tsx
//
// Exercises the share buttons client component. Verifies that:
// - Only the Bluesky link is rendered (no copy button).
// - Bluesky link points at the bsky.app intent endpoint with the expected
//   encoded text body.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShareButtons } from '@/components/ShareButtons';

describe('<ShareButtons />', () => {
  const shareableUrl = 'https://rabble.example/space/sp1';
  const title = 'My Space';

  it('renders only the Bluesky button', () => {
    render(<ShareButtons shareableUrl={shareableUrl} title={title} />);
    expect(screen.getByTestId('share-bluesky-button')).toBeInTheDocument();
    expect(screen.queryByTestId('share-copy-button')).not.toBeInTheDocument();
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
});
