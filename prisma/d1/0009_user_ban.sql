-- Platform-level ban: an admin can ban a User account (src/lib/admin.ts).
ALTER TABLE "User" ADD COLUMN "bannedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "banReason" TEXT;

CREATE INDEX "User_bannedAt_idx" ON "User"("bannedAt");
