// src/app/logout/page.tsx
//
// Dedicated logout page: simply hands the visitor off to the logout API
// route, which clears the session cookie and redirects back to `/`.
// Surfaced as a real page (rather than a bare anchor to the API route) so
// the link is easy to share, bookmark, and link to from the UI.

import type { ReactElement } from 'react';

export const dynamic = 'force-dynamic';

function publicUrl(): string {
  return (
    process.env.PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'https://rabble.exe.xyz'
  ).replace(/\/+$/, '');
}

export default function LogoutPage(): ReactElement {
  const url = `${publicUrl()}/api/auth/logout`;
  return (
    <>
      <meta httpEquiv="refresh" content={`0;url=${url}`} />
      <p className="p-4 text-sm text-slate-300">
        Signing you out… If you are not redirected,{' '}
        <a href={url} className="text-sky-400 hover:text-sky-300">
          click here
        </a>
        .
      </p>
    </>
  );
}
