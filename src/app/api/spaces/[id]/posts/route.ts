// src/app/api/spaces/[id]/posts/route.ts
//
// POST /api/spaces/[id]/posts  -> host only; resolve a Bluesky post URL,
//                                fetch its view from AppView, and persist a
//                                SpacePost row.
// GET  /api/spaces/[id]/posts  -> list posts for the space, ordered newest
//                                first.

import { NextResponse, type NextRequest } from 'next/server';
import {
  getSpaceById,
  getSpaceBySlug,
  resolveSpaceForUser,
} from '@/lib/spaces';
import { getCurrentUser } from '@/lib/session';
import { fetchPostView, resolvePostUrl } from '@/lib/bsky';
import { createSpacePost, listSpacePosts } from '@/lib/posts';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface PostsBody {
  postUrl?: unknown;
}

interface ErrorBody {
  ok?: boolean;
  error: string;
  message?: string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let body: PostsBody;
  try {
    body = (await request.json()) as PostsBody;
  } catch {
    return NextResponse.json(
      { error: 'invalid_json', message: 'Body must be JSON.' },
      { status: 400 }
    );
  }

  const postUrl = typeof body.postUrl === 'string' ? body.postUrl.trim() : '';
  if (!postUrl) {
    return NextResponse.json(
      { error: 'validation_error', message: 'postUrl is required.' },
      { status: 400 }
    );
  }

  const resolved = await resolveSpaceForUser(id, user.did);
  if (!resolved) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (!resolved.isHost) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Only the host can share posts.' },
      { status: 403 }
    );
  }

  let atUri: string;
  try {
    const ref = resolvePostUrl(postUrl);
    atUri = ref.atUri;
  } catch (err) {
    return NextResponse.json(
      {
        error: 'invalid_url',
        message: err instanceof Error ? err.message : 'Invalid post URL.',
      },
      { status: 400 }
    );
  }

  let view;
  try {
    view = await fetchPostView(atUri);
  } catch (err) {
    return NextResponse.json(
      {
        error: 'appview_failed',
        message:
          err instanceof Error
            ? err.message
            : 'Failed to fetch post from Bluesky.',
      },
      { status: 502 }
    );
  }

  try {
    const stored = await createSpacePost(
      {
        spaceId: resolved.space.id,
        atUri: view.uri ?? atUri,
        cid: view.cid,
        indexedAt: view.indexedAt
          ? new Date(view.indexedAt)
          : new Date(),
        authorDid:
          view.author?.did ??
          (view.record && (view.record as { author?: string }).author) ??
          '',
        embed: view.embed ?? null,
      },
      view
    );
    return NextResponse.json({ post: stored }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'store_failed',
        message: err instanceof Error ? err.message : 'Failed to save post.',
      },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  let space = await getSpaceById(id);
  if (!space) {
    space = await getSpaceBySlug(id);
  }
  if (!space) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  try {
    const posts = await listSpacePosts(space.id);
    return NextResponse.json({ posts }, { status: 200 });
  } catch (err) {
    const body: ErrorBody = {
      error: 'list_failed',
      message: err instanceof Error ? err.message : 'Failed to list posts.',
    };
    return NextResponse.json(body, { status: 500 });
  }
}
