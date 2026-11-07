-- Cached Bluesky follow lists for the "For you" home section.
CREATE TABLE "FollowCache" (
  "did" TEXT NOT NULL PRIMARY KEY,
  "follows" TEXT NOT NULL DEFAULT '[]',
  "count" INTEGER NOT NULL DEFAULT 0,
  "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
