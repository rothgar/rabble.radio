// tests/app/privacy-page.test.tsx

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrivacyPage from '@/app/privacy/page';

vi.mock('@/components/SiteHeader', () => ({ SiteHeader: () => null }));

describe('/privacy', () => {
  it('names the contact email and links back to itself from the footer', () => {
    render(<PrivacyPage />);
    expect(screen.getByTestId('privacy-contact-email').getAttribute('href')).toBe(
      'mailto:admin@rabble.radio'
    );
    expect(screen.getByTestId('footer-privacy-link').getAttribute('href')).toBe('/privacy');
  });

  it('covers the Bluesky account, live audio, feedback, notifications and crash-report sections', () => {
    render(<PrivacyPage />);
    expect(screen.getByTestId('privacy-account')).toBeInTheDocument();
    expect(screen.getByTestId('privacy-audio')).toBeInTheDocument();
    expect(screen.getByTestId('privacy-feedback')).toBeInTheDocument();
    expect(screen.getByTestId('privacy-notifications')).toBeInTheDocument();
    expect(screen.getByTestId('privacy-crashes')).toBeInTheDocument();
  });
});
