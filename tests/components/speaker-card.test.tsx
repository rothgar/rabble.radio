// tests/components/speaker-card.test.tsx

import { describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import { SpeakerCard } from '@/components/SpeakerCard';

afterEach(cleanup);

function baseProps() {
  return {
    identity: 'did:plc:guest',
    name: 'Guest',
    isMuted: false,
    isSpeaking: false,
  };
}

describe('<SpeakerCard /> report action', () => {
  it('only shows the menu (and Report) for a host viewing a remote speaker', () => {
    render(<SpeakerCard {...baseProps()} onReport={vi.fn()} />);
    expect(screen.queryByTestId('speaker-menu-trigger-did:plc:guest')).not.toBeInTheDocument();

    cleanup();
    render(<SpeakerCard {...baseProps()} isHostCard onReport={vi.fn()} />);
    fireEvent.click(screen.getByTestId('speaker-menu-trigger-did:plc:guest'));
    expect(screen.getByTestId('speaker-report-did:plc:guest')).toBeInTheDocument();
  });

  it('does not render Report without an onReport handler', () => {
    render(<SpeakerCard {...baseProps()} isHostCard />);
    fireEvent.click(screen.getByTestId('speaker-menu-trigger-did:plc:guest'));
    expect(screen.queryByTestId('speaker-report-did:plc:guest')).not.toBeInTheDocument();
  });

  it('opens a reason dialog, requires non-empty text, and reports the trimmed reason', () => {
    const onReport = vi.fn();
    render(<SpeakerCard {...baseProps()} isHostCard onReport={onReport} />);
    fireEvent.click(screen.getByTestId('speaker-menu-trigger-did:plc:guest'));
    fireEvent.click(screen.getByTestId('speaker-report-did:plc:guest'));

    const dialog = screen.getByTestId('report-dialog-did:plc:guest');
    expect(dialog).toBeInTheDocument();
    const submit = screen.getByTestId('report-dialog-submit-did:plc:guest');
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByTestId('report-dialog-reason-did:plc:guest'), {
      target: { value: '  Shouted slurs on air  ' },
    });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    expect(onReport).toHaveBeenCalledWith('Shouted slurs on air');
    expect(screen.queryByTestId('report-dialog-did:plc:guest')).not.toBeInTheDocument();
  });

  it('cancel closes the dialog without reporting', () => {
    const onReport = vi.fn();
    render(<SpeakerCard {...baseProps()} isHostCard onReport={onReport} />);
    fireEvent.click(screen.getByTestId('speaker-menu-trigger-did:plc:guest'));
    fireEvent.click(screen.getByTestId('speaker-report-did:plc:guest'));
    fireEvent.change(screen.getByTestId('report-dialog-reason-did:plc:guest'), {
      target: { value: 'bad behavior' },
    });
    fireEvent.click(screen.getByTestId('report-dialog-cancel-did:plc:guest'));
    expect(screen.queryByTestId('report-dialog-did:plc:guest')).not.toBeInTheDocument();
    expect(onReport).not.toHaveBeenCalled();
  });
});
