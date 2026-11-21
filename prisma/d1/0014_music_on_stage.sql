-- Whether the music tile sits in the on-stage grid (true) or has been
-- removed from stage while on air and moved into the audience list
-- (false). Ignored off air, where music is always on stage once a mood is
-- set (issue #111).
ALTER TABLE "Space" ADD COLUMN "musicOnStage" BOOLEAN NOT NULL DEFAULT true;
