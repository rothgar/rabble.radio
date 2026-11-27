-- AT URI/CID of the `community.lexicon.calendar.event` record published in
-- the host's own repo for a scheduled show (issue #154), null when none has
-- been published.
ALTER TABLE "Space" ADD COLUMN "calendarEventUri" TEXT;
ALTER TABLE "Space" ADD COLUMN "calendarEventCid" TEXT;
