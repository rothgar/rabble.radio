-- Feedback: problem reports sent from the feedback button, with captured
-- client state and environment details.
CREATE TABLE "Feedback" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "did" TEXT,
  "handle" TEXT,
  "category" TEXT NOT NULL DEFAULT 'problem',
  "message" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'web',
  "appVersion" TEXT,
  "page" TEXT,
  "spaceId" TEXT,
  "userAgent" TEXT,
  "context" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");
CREATE INDEX "Feedback_did_idx" ON "Feedback"("did");
