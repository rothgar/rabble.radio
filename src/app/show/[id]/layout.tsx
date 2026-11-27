// src/app/show/[id]/layout.tsx
//
// Supplies generateMetadata for the show detail page. page.tsx in this
// directory is deliberately Prisma-free (see its header comment), so this
// fetches the show over HTTP from the existing GET /api/spaces/[id] route
// instead of importing getSpaceById/toPublicSpace from src/lib/spaces.ts --
// that module imports the generated Prisma client, and pulling it into this
// route's module graph risks the exact bundling crash the page comment
// describes. The root layout's openGraph image is duplicated below rather
// than imported for the same reason (src/app/layout.tsx imports
// canonicalizeOrigin/defaultPublicOrigin from src/lib/spaces.ts).

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import type { PublicSpace } from '@/types';

interface SpaceResponse {
  space?: PublicSpace;
}

/** Mirrors `defaultPublicOrigin`'s own fallback chain in src/lib/spaces.ts
 * (`NEXT_PUBLIC_APP_URL || PUBLIC_URL || https://rabble.invalid`) without
 * importing that module. A self-hosted deployment is expected to set only
 * `PUBLIC_URL`; an unset or malformed value degrades to a host that always
 * 404s, so metadata falls back to the site-wide default instead of
 * throwing. */
function resolveAppOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || process.env.PUBLIC_URL;
  if (!raw) return 'https://rabble.invalid';
  try {
    return new URL(raw).origin;
  } catch {
    return 'https://rabble.invalid';
  }
}

async function fetchShow(id: string): Promise<PublicSpace | null> {
  try {
    const res = await fetch(
      `${resolveAppOrigin()}/api/spaces/${encodeURIComponent(id)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as SpaceResponse;
    return body.space ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const space = id ? await fetchShow(id) : null;
  // No metadata overrides: Next.js fills in the site-wide default from
  // src/app/layout.tsx (title, description, og:image) unchanged.
  if (!space) return {};

  const description =
    space.description?.trim() ||
    `A live show hosted by ${space.host.displayName || space.host.handle}.`;

  return {
    title: space.title,
    description,
    openGraph: {
      type: 'website',
      siteName: 'Rabble',
      title: space.title,
      description,
      url: space.shareableUrl,
      images: [{ url: '/og-default.png', width: 1200, height: 630 }],
    },
  };
}

export default function ShowLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return children;
}
