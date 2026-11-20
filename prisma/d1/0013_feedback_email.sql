-- Contact email for a feedback report, used by the `beta` category (Android
-- beta sign-ups have no Bluesky session to carry a did/handle).
ALTER TABLE "Feedback" ADD COLUMN "email" TEXT;
