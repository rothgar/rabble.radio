// tests/components/nocturne-shell.test.tsx
//
// Guards the mobile layout of the live-room shell: the body must stack
// vertically on phones (and only become the two-column grid at md:), the
// header links back to /stations, and the sticky footer renders.

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { NocturneShell } from '@/components/NocturneShell';

function renderShell() {
  return render(
    <NocturneShell
      navAvatar={<div>avatar</div>}
      header={<div>header</div>}
      main={<div>main</div>}
      sidebar={<div>sidebar</div>}
      bottomBar={<div>bottom</div>}
    />
  );
}

describe('<NocturneShell />', () => {
  it('stacks the body vertically on mobile and grids at md:', () => {
    renderShell();
    const main = screen.getByTestId('nocturne-main');
    const sidebar = screen.getByTestId('nocturne-sidebar');
    const body = main.parentElement;
    expect(body).not.toBeNull();
    expect(body).toContainElement(sidebar);
    expect(body!.className).toContain('flex-col');
    expect(body!.className).toContain('md:grid');
  });

  it('header links to /stations and keeps the avatar slot', () => {
    renderShell();
    const nav = screen.getByTestId('nocturne-nav');
    const link = within(nav).getByRole('link', { name: /rabble radio/i });
    expect(link).toHaveAttribute('href', '/stations');
    expect(screen.getByTestId('nocturne-nav-avatar')).toBeInTheDocument();
  });

  it('renders the sticky footer', () => {
    renderShell();
    expect(screen.getByTestId('nocturne-footer')).toBeInTheDocument();
  });
});
