// src/components/Footer.tsx
//
// Site-wide footer for the top-level browsing pages (home, stations,
// station, show, hosts, privacy). Carries the privacy policy link required
// by Play Console's Data safety form and an App Store Connect listing
// (#95). The live room (NocturneShell) has its own sticky bottom bar and
// does not use this footer.
//
// Renders as the last child of a `flex min-h-screen flex-col` wrapper, with
// `PageLayout`'s `flex-1` main as its sibling before it — that's what pins
// it to the bottom of a short page instead of leaving it a scroll below the
// fold. See REVIEW.md, "sticky-footer composition".

import Link from 'next/link';
import type { ReactElement } from 'react';

export function Footer(): ReactElement {
  return (
    <footer
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-[var(--color-divider)] px-4 py-6 text-caption text-[var(--color-text-tertiary)] sm:px-6"
      data-testid="site-footer"
    >
      <span>rabble radio</span>
      <Link
        href="/privacy"
        className="inline-flex min-h-touch items-center hover:text-[var(--color-text)]"
        data-testid="footer-privacy-link"
      >
        Privacy
      </Link>
    </footer>
  );
}

export default Footer;
