-- Report: a host's report of a speaker's behavior, for admin review.
CREATE TABLE "Report" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "spaceId" TEXT NOT NULL,
  "reporterDid" TEXT NOT NULL,
  "reporterHandle" TEXT,
  "reportedDid" TEXT NOT NULL,
  "reportedHandle" TEXT,
  "reason" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Report_createdAt_idx" ON "Report"("createdAt");
CREATE INDEX "Report_reportedDid_idx" ON "Report"("reportedDid");
