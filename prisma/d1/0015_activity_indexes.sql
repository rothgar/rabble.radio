-- Standalone indexes on the date columns the admin activity overview
-- (src/lib/admin.ts getPlatformActivity, issue #178) windows and buckets
-- by. The existing indexes on these tables are all composite, leading with
-- a column (spaceId, hostDid, identity) the activity queries don't filter
-- by, so a plain range scan on the date column alone wouldn't use them.
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");
CREATE INDEX "ShowSession_startedAt_idx" ON "ShowSession"("startedAt");
CREATE INDEX "ShowParticipation_joinedAt_idx" ON "ShowParticipation"("joinedAt");
CREATE INDEX "ShowReaction_createdAt_idx" ON "ShowReaction"("createdAt");
CREATE INDEX "ShowLike_createdAt_idx" ON "ShowLike"("createdAt");
