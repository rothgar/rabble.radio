// tests/app/space-page.test.tsx
//
// Exercises the (now client) space detail page at
// `/src/app/space/[id]/page.tsx` (singular `space`, not `spaces`, so it
// does not share a webpack chunk with the Prisma-using API routes under
// `/api/spaces/[id]/...`). Verifies the three primary render states
// (loading, not-found, ready) plus the loading->ready transition
// triggered by `useEffect`. The page must remain Prisma-free on the
// client side, so we mock `fetch` directly rather than touching any
// server module.

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { PublicSpace, PublicUser } from '@/types';

// Stub next/navigation so we can drive the id via a mocked useParams.
// ActiveRoomProvider also calls usePathname(); stub it to a path that never
// matches a show route so none of these tests pick up an active session.
vi.mock('next/navigation', () => ({
  useParams: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

import { useParams } from 'next/navigation';
import SpacePage from '@/app/show/[id]/page';
import { ActiveRoomProvider } from '@/components/ActiveRoomProvider';

const mockUseParams = useParams as unknown as ReturnType<typeof vi.fn>;

/** SpacePageClient reads the join session from ActiveRoomProvider (it
 * survives navigating away from this page, see issue #7), so every render
 * needs a real provider in the tree. */
function renderPage(): ReturnType<typeof render> {
  return render(
    <ActiveRoomProvider>
      <SpacePage />
    </ActiveRoomProvider>
  );
}

function makeSpace(overrides: Partial<PublicSpace> = {}): PublicSpace {
  return {
    id: 'sp1',
    slug: 'sp1',
    title: 'Test Space',
    description: 'A description',
    isLive: false,
    status: 'scheduled',
    scheduledAt: '2025-03-01T00:00:00.000Z',
    expiresAt: null,
    listenerCount: 0,
    speakerCount: 0,
    reactionCount: 0,
    tunedInCount: 0,
    likeCount: 0,
    sessionCount: 0,
    totalListeners: 0,
    hostedSeconds: 0,
    lastLiveAt: null,
    tags: [],
    createdAt: '2025-02-01T00:00:00.000Z',
    updatedAt: '2025-02-01T00:00:00.000Z',
    host: {
      did: 'did:plc:host',
      handle: 'host.bsky.social',
      displayName: 'Host',
      avatarUrl: null,
    },
    shareableUrl: 'https://rabble.example/space/sp1',
    replay: null,
    reminded: false,
    isNamedShow: false,
    podcastFeedEnabled: false,
    podcastFeedUrl: null,
    ...overrides,
  };
}

function makeUser(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: 'user-1',
    did: 'did:plc:viewer',
    handle: 'viewer.bsky.social',
    displayName: 'Viewer',
    avatarUrl: null,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('<SpacePage />', () => {
  beforeEach(() => {
    mockUseParams.mockReturnValue({ id: 'sp1' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the loading state on first render', () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    expect(screen.getByTestId('space-loading')).toBeInTheDocument();
    expect(screen.getByText(/loading the show/i)).toBeInTheDocument();
  });

  it('renders the not-found state when the API returns 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 404));
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('space-not-found')).toBeInTheDocument();
    });
    expect(
      screen.getByRole('heading', { name: /show not found/i })
    ).toBeInTheDocument();
  });

  it('renders the error state with a retry button on network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('boom'));
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('space-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('space-error')).toHaveTextContent('boom');
    expect(
      screen.getByTestId('space-retry-button')
    ).toBeInTheDocument();
  });

  it('renders the space details once the API resolves', async () => {
    const space = makeSpace();
    const user = makeUser({ did: space.host.did });

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/spaces/sp1') {
        return Promise.resolve(jsonResponse({ space }));
      }
      if (url === '/api/me') {
        return Promise.resolve(jsonResponse(user));
      }
      if (url === '/api/spaces/sp1/recording') {
        return Promise.resolve(jsonResponse({ recording: null }));
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('space-detail')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      space.title
    );
    expect(screen.getByTestId('shareable-url')).toHaveTextContent(
      space.shareableUrl
    );
    expect(screen.getByTestId('space-status-badge')).toHaveTextContent(
      /scheduled/i
    );
    expect(screen.getByTestId('scheduled-info')).toBeInTheDocument();
  });

  it('omits the recording block for non-host viewers', async () => {
    const space = makeSpace();
    const viewer = makeUser(); // different did from host

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/spaces/sp1') {
        return Promise.resolve(jsonResponse({ space }));
      }
      if (url === '/api/me') {
        return Promise.resolve(jsonResponse(viewer));
      }
      if (url === '/api/spaces/sp1/recording') {
        return Promise.resolve(jsonResponse({ recording: null }));
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('space-detail')).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId('recording-download')
    ).not.toBeInTheDocument();
  });

  it('passes credentials include on the page-level fetches', async () => {
    const space = makeSpace();
    const user = makeUser({ did: space.host.did });

    const seenOpts: Array<{ url: string; opts: RequestInit | undefined }> = [];
    const fetchMock = vi
      .fn()
      .mockImplementation((url: string, opts?: RequestInit) => {
        seenOpts.push({ url, opts });
        if (url === '/api/spaces/sp1') {
          return Promise.resolve(jsonResponse({ space }));
        }
        if (url === '/api/me') {
          return Promise.resolve(jsonResponse(user));
        }
        if (url === '/api/spaces/sp1/recording') {
          return Promise.resolve(jsonResponse({ recording: null }));
        }
        return Promise.reject(new Error(`unexpected url ${url}`));
      });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('space-detail')).toBeInTheDocument();
    });

    // Only inspect the three page-level fetches; child components (e.g.
    // SpacePageClient) make their own calls independently.
    const pageUrls = [
      '/api/spaces/sp1',
      '/api/me',
      '/api/spaces/sp1/recording',
    ];
    for (const pageUrl of pageUrls) {
      const entry = seenOpts.find((e) => e.url === pageUrl);
      expect(entry, `expected a fetch for ${pageUrl}`).toBeDefined();
      expect(entry?.opts?.credentials).toBe('include');
    }
  });

  it('retries loading when the retry button is clicked', async () => {
    let firstSpaceFetch = true;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/spaces/sp1') {
        if (firstSpaceFetch) {
          firstSpaceFetch = false;
          return Promise.reject(new Error('first boom'));
        }
        return Promise.resolve(jsonResponse({ space: makeSpace() }));
      }
      if (url === '/api/me') {
        return Promise.resolve(jsonResponse({}, 401));
      }
      if (url === '/api/spaces/sp1/recording') {
        return Promise.resolve(jsonResponse({ recording: null }));
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('space-error')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('space-retry-button'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('space-detail')).toBeInTheDocument();
    });
  });

  it('treats an unauthenticated /api/me as anonymous viewer', async () => {
    const space = makeSpace();

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/spaces/sp1') {
        return Promise.resolve(jsonResponse({ space }));
      }
      if (url === '/api/me') {
        return Promise.resolve(jsonResponse({}, 401));
      }
      if (url === '/api/spaces/sp1/recording') {
        return Promise.resolve(jsonResponse({}, 403));
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('space-detail')).toBeInTheDocument();
    });
    // Anonymous viewer sees the sign-in prompt instead of a join button.
    const signInLinks = screen.getAllByRole('link', { name: /sign in/i });
    expect(signInLinks.length).toBeGreaterThan(0);
    for (const link of signInLinks) {
      expect(link.getAttribute('href') ?? '').toMatch(/^\/login/);
    }
    expect(screen.queryByTestId('join-button')).not.toBeInTheDocument();
  });
});
