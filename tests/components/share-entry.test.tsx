// tests/components/share-entry.test.tsx

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ShareEntry } from '@/components/ShareEntry';

afterEach(cleanup);

const shareableUrl = 'https://rabble.example/space/sp1';
const title = 'My Space';

describe('<ShareEntry />', () => {
  it('opens a popover with Bluesky share and copy-link actions', () => {
    render(<ShareEntry variant="bubble" shareableUrl={shareableUrl} title={title} />);
    expect(screen.queryByTestId('share-entry-menu')).toBeNull();
    fireEvent.click(screen.getByTestId('share-entry-trigger'));
    const bsky = screen.getByTestId('share-entry-bluesky');
    expect(bsky.getAttribute('href') ?? '').toContain('https://bsky.app/intent/compose?text=');
    expect(screen.getByTestId('share-entry-copy')).toBeInTheDocument();
  });

  it('copies the shareable link to the clipboard and shows feedback before closing', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ShareEntry variant="row" shareableUrl={shareableUrl} title={title} />);
    fireEvent.click(screen.getByTestId('share-entry-trigger'));
    fireEvent.click(screen.getByTestId('share-entry-copy'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(shareableUrl));
    expect(screen.getByTestId('share-entry-copy')).toHaveTextContent('Copied!');
    expect(screen.getByTestId('share-entry-menu')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('share-entry-menu')).toBeNull(), { timeout: 2000 });
  });

  it('closes the popover on an outside click', () => {
    render(
      <div>
        <ShareEntry variant="row" shareableUrl={shareableUrl} title={title} />
        <button data-testid="outside">outside</button>
      </div>
    );
    fireEvent.click(screen.getByTestId('share-entry-trigger'));
    expect(screen.getByTestId('share-entry-menu')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('share-entry-menu')).toBeNull();
  });
});
