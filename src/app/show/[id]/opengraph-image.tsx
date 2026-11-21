// src/app/show/[id]/opengraph-image.tsx
//
// Per-show opengraph image: the monogram, the "rabble radio" wordmark, and
// up to 4 on-stage host avatars (PublicSpace.onStageHosts, capped by
// src/lib/space-extras.ts). Same constraints as layout.tsx in this
// directory: this route must stay Prisma-free (see page.tsx's header
// comment), so the show comes over HTTP from GET /api/spaces/[id] rather
// than from src/lib/spaces.ts, and the font is fetched from `public/`
// rather than read off disk -- this Worker has no real filesystem once
// deployed (see wrangler.jsonc), only what OpenNext bundles or what's
// served through the ASSETS binding.
//
// Colours below are the brand palette's literal hex values (docs/brand.md),
// not `var(--color-*)` tokens: this tree is rendered by satori to a static
// PNG, outside the browser, so CSS custom properties never resolve. The
// monogram's path data comes from src/lib/brand-mark.ts rather than
// src/components/ui/Logo.tsx's Monogram directly: that component sizes
// itself with a Tailwind `className` and colours itself with
// `var(--color-accent)`, neither of which satori can read (see REVIEW.md).
//
// Every fetch here (the font, each avatar) is wrapped: satori throws
// mid-render on a failed `<img src>` or a bad `fonts[]` entry, and an
// uncaught throw out of this route is a 500 with no image at all -- worse
// than the graceful "branding only" degrade this file is built around for
// an off-air or not-found show (see REVIEW.md).

import { ImageResponse } from 'next/og';
import type { ReactElement } from 'react';
import type { PublicHost, PublicSpace } from '@/types';
import { MONOGRAM_LETTER_PATH, MONOGRAM_VIEW_BOX, MONOGRAM_WAVE_ARCS, MONOGRAM_WAVE_DOT } from '@/lib/brand-mark';

export const runtime = 'nodejs';
export const alt = 'rabble radio';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface SpaceResponse {
  space?: PublicSpace;
}

/** Mirrors `resolveAppOrigin`/`fetchShow` in layout.tsx -- duplicated for
 * the same reason the root layout's og:image is duplicated there: avoid
 * importing anything that pulls the generated Prisma client into this
 * route's module graph. */
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
    const res = await fetch(`${resolveAppOrigin()}/api/spaces/${encodeURIComponent(id)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as SpaceResponse;
    return body.space ?? null;
  } catch {
    return null;
  }
}

/** Best-effort: satori requires at least one registered font whenever the
 * tree has any text (an empty `fonts: []` throws, "No fonts are loaded"),
 * but omitting the `fonts` option entirely falls back to next/og's own
 * bundled default face -- so a failed fetch here still renders, just not
 * in Fraunces. */
async function fetchFrauncesFont(origin: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(`${origin}/fonts/fraunces-black.ttf`);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

const BSKY_APP_HOST = /(^|\.)bsky\.app$/;
const BSKY_NETWORK_HOST = /(^|\.)bsky\.network$/;

/** avatarUrl is a Bluesky profile field (set from `profile.data.avatar` in
 * src/app/api/auth/bluesky/callback/route.ts), so a host's PDS/AppView
 * controls it. Every other place in the app renders it client-side; this
 * is the one place it's fetched by the server (satori, to rasterize the
 * PNG), so it gets its own allowlist rather than relying solely on the
 * deployed Worker's `global_fetch_strictly_public` compatibility flag
 * (wrangler.jsonc) for defense in depth. */
function allowedAvatarHostname(url: string): string | null {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:') return null;
    return BSKY_APP_HOST.test(hostname) || BSKY_NETWORK_HOST.test(hostname) ? hostname : null;
  } catch {
    return null;
  }
}

/** cdn.bsky.app's image proxy defaults to serving WebP, which the bundled
 * resvg rasterizer (next/og's PNG renderer) can't decode -- not an error,
 * just a blank circle where the avatar should be (see REVIEW.md). Bluesky's
 * CDN honours an explicit format via an `@<ext>` path suffix, so request
 * jpeg there. A raw PDS blob host (*.bsky.network) has no such proxy or
 * suffix convention, so it's fetched as stored. */
function fetchableAvatarUrl(url: string, hostname: string): string {
  if (!BSKY_APP_HOST.test(hostname)) return url;
  return `${url.replace(/@[a-zA-Z0-9]+$/, '')}@jpeg`;
}

/** Fetches the avatar ourselves and inlines it as a data URI, so satori
 * never makes its own (uncaught-on-failure) fetch for it. Returns null on
 * any failure or disallowed host, which the caller renders as initials. */
async function avatarDataUri(url: string): Promise<string | null> {
  const hostname = allowedAvatarHostname(url);
  if (!hostname) return null;
  try {
    const res = await fetch(fetchableAvatarUrl(url, hostname), { cache: 'no-store' });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const bytes = await res.arrayBuffer();
    return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`;
  } catch {
    return null;
  }
}

function initialsFor(host: PublicHost): string {
  const name = (host.displayName || host.handle || '').trim();
  return name ? name.slice(0, 2).toUpperCase() : '??';
}

function Avatar({ host, dataUri }: { host: PublicHost; dataUri: string | null }): ReactElement {
  const dimension = 160;
  if (dataUri) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={dataUri}
        width={dimension}
        height={dimension}
        style={{
          borderRadius: '50%',
          objectFit: 'cover',
          border: '6px solid #073B4C',
        }}
      />
    );
  }
  return (
    <div
      style={{
        display: 'flex',
        width: dimension,
        height: dimension,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        border: '6px solid #073B4C',
        backgroundColor: '#F9C74F',
        color: '#073B4C',
        fontSize: 56,
        fontWeight: 700,
      }}
    >
      {initialsFor(host)}
    </div>
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ImageResponse> {
  const { id } = await params;
  const space = id ? await fetchShow(id) : null;
  const hosts = (space?.onStageHosts ?? []).slice(0, 4);
  const origin = resolveAppOrigin();
  const [fraunces, dataUris] = await Promise.all([
    fetchFrauncesFont(origin),
    Promise.all(hosts.map((host) => (host.avatarUrl ? avatarDataUri(host.avatarUrl) : Promise.resolve(null)))),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 56,
          backgroundColor: '#F1FAEE',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <svg width="110" height="110" viewBox={MONOGRAM_VIEW_BOX}>
            <path fill="#073B4C" d={MONOGRAM_LETTER_PATH} />
            <circle cx={MONOGRAM_WAVE_DOT.cx} cy={MONOGRAM_WAVE_DOT.cy} r={MONOGRAM_WAVE_DOT.r} fill="#E63946" />
            {MONOGRAM_WAVE_ARCS.map((d) => (
              <path key={d} d={d} fill="none" stroke="#E63946" strokeWidth={58.5} strokeLinecap="round" />
            ))}
          </svg>
          <span style={{ fontFamily: 'Fraunces', fontSize: 104, color: '#073B4C' }}>rabble radio</span>
        </div>
        {hosts.length > 0 ? (
          <div style={{ display: 'flex', gap: 28 }}>
            {hosts.map((host, i) => (
              <Avatar key={host.did} host={host} dataUri={dataUris[i]} />
            ))}
          </div>
        ) : null}
      </div>
    ),
    fraunces
      ? { width: size.width, height: size.height, fonts: [{ name: 'Fraunces', data: fraunces, weight: 900, style: 'normal' }] }
      : { width: size.width, height: size.height }
  );
}
