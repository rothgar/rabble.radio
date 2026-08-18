// src/app/logout/page.tsx
//
// Dedicated logout page: simply hands the visitor off to the logout API
// route, which clears the session cookie and redirects back to `/`.
// Surfaced as a real page (rather than a bare anchor to the API route) so
// the link is easy to share, bookmark, and link to from the UI.

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

function publicUrl(): string {
  return (
    process.env.PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'https://rabble.exe.xyz'
  );
}

export default function LogoutPage(): never {
  const base = publicUrl().replace(/\/+$/, '');
  redirect(`${base}/api/auth/logout`);
}
