// src/lib/tags.ts
//
// Category tags used to group shows into stations. The option set mirrors
// YouTube's video categories so hosts tag their show the way they would tag
// a YouTube video. A host can attach up to MAX_TAGS_PER_SHOW tags.

/** Maximum number of tags a host can attach to a single show. */
export const MAX_TAGS_PER_SHOW = 3;

/** YouTube video categories used as the tag vocabulary. */
export const YOUTUBE_CATEGORIES: readonly string[] = [
  'Autos & Vehicles',
  'Comedy',
  'Education',
  'Entertainment',
  'Film & Animation',
  'Gaming',
  'Howto & Style',
  'Music',
  'News & Politics',
  'Nonprofits & Activism',
  'People & Blogs',
  'Pets & Animals',
  'Science & Technology',
  'Sports',
  'Travel & Events',
];

const ALLOWED = new Set(YOUTUBE_CATEGORIES);

/**
 * One-line prompts shown on empty station cards to encourage people to start
 * a show in that category.
 */
export const CATEGORY_PROMPTS: Record<string, string> = {
  'Autos & Vehicles': 'Talk about cars, EVs, and the open road',
  Comedy: 'Crack each other up with your best bits',
  Education: 'Teach something you are passionate about',
  Entertainment: 'Review the latest shows, movies, and drops',
  'Film & Animation': 'Discuss what is on your watchlist',
  Gaming: 'Debate the latest releases and strategies',
  'Howto & Style': 'Share a craft, recipe, or style tip',
  Music: 'Share tracks, playlists, and live sets',
  'News & Politics': 'Talk about today\u2019s topics',
  'Nonprofits & Activism': 'Spotlight causes and community action',
  'People & Blogs': 'Vlog your day or tell a story',
  'Pets & Animals': 'Show off your furry friends and pets',
  'Science & Technology': 'Geek out over the latest discoveries',
  Sports: 'What\u2019s happening in your favorite sport?',
  'Travel & Events': 'Swap travel stories and plans',
};

/** True if `tag` is a valid category tag. */
export function isValidTag(tag: string): boolean {
  return ALLOWED.has(tag);
}

/**
 * Normalize an arbitrary set of tags into a valid, de-duplicated list capped
 * at `MAX_TAGS_PER_SHOW`. Unknown/invalid values and empty strings are
 * dropped. Returns a stable array ([] when nothing is valid).
 */
export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (out.length >= MAX_TAGS_PER_SHOW) break;
    if (typeof raw !== 'string') continue;
    const tag = raw.trim();
    if (!tag || !isValidTag(tag) || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/**
 * Return the primary (dedup) station tag for a show: the tag that appears
 * earliest in the canonical YouTube-category order. Returns null when the show
 * has no valid tags. Used so a show appears under exactly one station on the
 * home page even when it carries multiple tags.
 */
export function primaryTagOf(tags: readonly string[]): string | null {
  let best: string | null = null;
  let bestIndex = Number.POSITIVE_INFINITY;
  for (const tag of tags) {
    const index = YOUTUBE_CATEGORIES.indexOf(tag);
    if (index >= 0 && index < bestIndex) {
      bestIndex = index;
      best = tag;
    }
  }
  return best;
}

