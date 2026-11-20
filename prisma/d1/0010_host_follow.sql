-- Follow a host: notified whenever any of their shows goes live.
CREATE TABLE "HostFollow" (
  "hostDid" TEXT NOT NULL,
  "did" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notifiedAt" DATETIME,
  PRIMARY KEY ("hostDid", "did")
);

CREATE INDEX "HostFollow_did_idx" ON "HostFollow"("did");
CREATE INDEX "HostFollow_hostDid_notifiedAt_idx" ON "HostFollow"("hostDid", "notifiedAt");
