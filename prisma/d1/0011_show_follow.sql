-- Follow one specific named show: notified only when its host goes live as
-- the host of that exact show.
CREATE TABLE "ShowFollow" (
  "spaceId" TEXT NOT NULL,
  "did" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notifiedAt" DATETIME,
  PRIMARY KEY ("spaceId", "did"),
  CONSTRAINT "ShowFollow_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ShowFollow_did_idx" ON "ShowFollow"("did");
CREATE INDEX "ShowFollow_spaceId_notifiedAt_idx" ON "ShowFollow"("spaceId", "notifiedAt");
