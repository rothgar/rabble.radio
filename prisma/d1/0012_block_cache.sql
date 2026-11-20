-- Cached Bluesky block lists used to hide blocked hosts and shows.
CREATE TABLE "BlockCache" (
  "did" TEXT NOT NULL PRIMARY KEY,
  "blocks" TEXT NOT NULL DEFAULT '[]',
  "count" INTEGER NOT NULL DEFAULT 0,
  "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
