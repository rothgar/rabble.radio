// tests/components/show-details-form.test.tsx
//
// In-room editing of the show's title, description and station topics.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ShowDetailsForm } from '@/components/ShowDetailsForm';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('<ShowDetailsForm />', () => {
  it('keeps Save disabled until something changes', () => {
    render(<ShowDetailsForm spaceId="sp1" title="My show" tags={['Music']} />);
    expect(screen.getByTestId('show-details-save')).toBeDisabled();
    fireEvent.change(screen.getByTestId('show-title-input'), { target: { value: 'Renamed' } });
    expect(screen.getByTestId('show-details-save')).toBeEnabled();
  });

  it('caps topics at three', () => {
    render(<ShowDetailsForm spaceId="sp1" title="My show" tags={['Music', 'Comedy', 'Gaming']} />);
    expect(screen.getByTestId('show-tag-Education')).toBeDisabled();
    fireEvent.click(screen.getByTestId('show-tag-Music'));
    expect(screen.getByTestId('show-tag-Education')).toBeEnabled();
  });

  it('PATCHes the space and reports the saved details', async () => {
    const onSaved = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        space: { title: 'Renamed', description: 'About it', tags: ['Music', 'Comedy'] },
      }),
    }) as unknown as typeof fetch;

    render(<ShowDetailsForm spaceId="sp1" title="My show" tags={['Music']} onSaved={onSaved} />);
    fireEvent.change(screen.getByTestId('show-title-input'), { target: { value: ' Renamed ' } });
    fireEvent.change(screen.getByTestId('show-description-input'), { target: { value: 'About it' } });
    fireEvent.click(screen.getByTestId('show-tag-Comedy'));
    fireEvent.submit(screen.getByTestId('show-details-form'));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/spaces/sp1');
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      title: 'Renamed',
      description: 'About it',
      tags: ['Music', 'Comedy'],
    });
    expect(onSaved).toHaveBeenCalledWith({
      title: 'Renamed',
      description: 'About it',
      tags: ['Music', 'Comedy'],
    });
    expect(screen.getByTestId('show-details-saved')).toHaveTextContent('Saved');
  });

  it('shows the server error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'forbidden', message: 'Only the host can edit this show.' }),
    }) as unknown as typeof fetch;
    render(<ShowDetailsForm spaceId="sp1" title="My show" />);
    fireEvent.change(screen.getByTestId('show-title-input'), { target: { value: 'X' } });
    fireEvent.submit(screen.getByTestId('show-details-form'));
    await waitFor(() =>
      expect(screen.getByTestId('show-details-error')).toHaveTextContent('Only the host can edit this show.')
    );
  });
});
