// Comma-separated DID allowlists from the environment (ADMIN_DIDS and
// friends). Matching is by DID only: a Bluesky handle can be released and
// claimed by someone else, so a handle in the list would hand that someone
// the role at their next login.

export function didAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.startsWith('did:'))
  );
}

export function isAllowlisted(
  user: { did: string } | null | undefined,
  allow: Set<string>
): boolean {
  return Boolean(user) && allow.has((user as { did: string }).did.toLowerCase());
}
