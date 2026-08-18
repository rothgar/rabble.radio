import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomePage from '@/app/page';

describe('HomePage', () => {
  it('renders the Rabble heading', () => {
    render(<HomePage />);
    expect(
      screen.getByRole('heading', { level: 1, name: /rabble/i })
    ).toBeInTheDocument();
  });

  it('renders a link to /api/health', () => {
    render(<HomePage />);
    const link = screen.getByRole('link', { name: /check health/i });
    expect(link).toHaveAttribute('href', '/api/health');
  });
});
