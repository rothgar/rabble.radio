-- CreateTable
CREATE TABLE "OAuthSession" (
    "id" TEXT NOT NULL,
    "did" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthSession_did_key" ON "OAuthSession"("did");

-- CreateIndex
CREATE INDEX "OAuthSession_did_idx" ON "OAuthSession"("did");
