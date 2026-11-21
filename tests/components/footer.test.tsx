// tests/components/footer.test.tsx
//
// The site footer carries the privacy policy link required by Play
// Console's Data safety form and an App Store Connect listing (#95).

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer } from '@/components/Footer';

describe('<Footer />', () => {
  it('links to the privacy policy', () => {
    render(<Footer />);
    expect(screen.getByTestId('footer-privacy-link').getAttribute('href')).toBe('/privacy');
  });

  it('keeps the privacy link at a 44px touch target', () => {
    render(<Footer />);
    expect(screen.getByTestId('footer-privacy-link').className).toContain('min-h-touch');
  });
});
