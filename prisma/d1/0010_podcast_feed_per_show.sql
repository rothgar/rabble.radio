-- A host can turn one show into its own podcast feed, scoped to just that
-- show's published recordings.
ALTER TABLE "Space" ADD COLUMN "podcastFeedEnabled" BOOLEAN NOT NULL DEFAULT false;
