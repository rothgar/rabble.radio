-- Mark a show as auto-titled ("Start a show" with no title) so its default
-- show can be looked up directly instead of by matching rendered title text
-- (issue #33: a host renaming themselves on Bluesky broke that match).
ALTER TABLE "Space" ADD COLUMN "isDefaultTitled" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: existing rows have no earlier marker, so identify the ones that
-- still match one of the two known rendered default-title shapes (current
-- display name, or the pre-#23 handle-only shape) using the host's current
-- profile. A row whose host has since renamed again stays unmarked; the next
-- "Start a show" without a title creates a fresh default-titled show for them.
UPDATE "Space"
SET "isDefaultTitled" = true
WHERE id IN (
  SELECT s.id
  FROM "Space" s
  JOIN "User" u ON u.did = s.hostId
  WHERE s.title = (
    'The ' ||
    CASE
      WHEN u.displayName IS NOT NULL AND TRIM(u.displayName) <> '' THEN TRIM(u.displayName)
      WHEN u.handle LIKE '@%' THEN TRIM(u.handle)
      ELSE '@' || TRIM(u.handle)
    END || ' show'
  )
  OR s.title = (
    (CASE WHEN u.handle LIKE '@%' THEN TRIM(u.handle) ELSE '@' || TRIM(u.handle) END) || '''s show'
  )
);
