-- Add Recording table for storing metadata about LiveKit egress sessions.
-- One row per recording (i.e. per "Go Live" event). `expiresAt` is set 30
-- days out from the start time so the cleanup sweep can delete rows
-- deterministically without scanning `endedAt`.
CREATE TABLE "Recording" (
    "id"          TEXT NOT NULL,
    "spaceId"     TEXT NOT NULL,
    "egressId"    TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'starting',
    "startedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt"     TIMESTAMP(3),
    "expiresAt"   TIMESTAMP(3) NOT NULL,
    "s3Key"       TEXT NOT NULL,
    "s3Bucket"    TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'audio/mpeg',
    "sizeBytes"   INTEGER,
    "downloadUrl" TEXT,
    "hostDid"     TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Recording_egressId_key" ON "Recording"("egressId");
CREATE INDEX "Recording_spaceId_idx" ON "Recording"("spaceId");
CREATE INDEX "Recording_expiresAt_idx" ON "Recording"("expiresAt");
CREATE INDEX "Recording_status_idx" ON "Recording"("status");

-- AddForeignKey
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_spaceId_fkey"
    FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
