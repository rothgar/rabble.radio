-- "Notify me" reminders for scheduled shows.
CREATE TABLE "ShowReminder" (
  "spaceId" TEXT NOT NULL,
  "did" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notifiedAt" DATETIME,
  PRIMARY KEY ("spaceId", "did"),
  CONSTRAINT "ShowReminder_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ShowReminder_did_idx" ON "ShowReminder"("did");
