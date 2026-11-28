-- Dedup state for the popular-show watcher's Bluesky announcement
-- (issue #175): `announcedAt` is set once a show's "going popular" post
-- succeeds (or `announceAttempts` hits the watcher's retry limit), so a show
-- is announced at most once, ever.
ALTER TABLE "Space" ADD COLUMN "announcedAt" DATETIME;
ALTER TABLE "Space" ADD COLUMN "announceAttempts" INTEGER NOT NULL DEFAULT 0;
