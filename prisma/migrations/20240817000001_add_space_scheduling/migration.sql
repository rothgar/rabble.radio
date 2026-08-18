-- Add scheduling and expiration columns to Space.
ALTER TABLE "Space" ADD COLUMN "scheduledAt" TIMESTAMP(3);
ALTER TABLE "Space" ADD COLUMN "expiresAt" TIMESTAMP(3);
ALTER TABLE "Space" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';

-- CreateIndex
CREATE INDEX "Space_status_idx" ON "Space"("status");
CREATE INDEX "Space_scheduledAt_idx" ON "Space"("scheduledAt");
CREATE INDEX "Space_expiresAt_idx" ON "Space"("expiresAt");
