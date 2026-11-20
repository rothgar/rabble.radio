export function buildBlueskyShareHref(shareableUrl: string, title: string): string {
  return `https://bsky.app/intent/compose?text=${encodeURIComponent(
    `Tune in to my show on Rabble Radio: ${title}\n${shareableUrl}`
  )}`;
}
