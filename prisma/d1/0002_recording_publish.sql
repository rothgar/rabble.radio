-- Podcast publishing: a host can publish a finished recording as an episode.
ALTER TABLE "Recording" ADD COLUMN "published" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Recording" ADD COLUMN "publishedAt" DATETIME;

CREATE INDEX "Recording_hostDid_published_idx" ON "Recording"("hostDid", "published");
