-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "did" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Space" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "hostId" TEXT NOT NULL,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpacePost" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "atUri" TEXT NOT NULL,
    "cid" TEXT NOT NULL,
    "indexedAt" TIMESTAMP(3) NOT NULL,
    "authorDid" TEXT NOT NULL,
    "embed" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpacePost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_did_key" ON "User"("did");

-- CreateIndex
CREATE INDEX "User_handle_idx" ON "User"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "Space_slug_key" ON "Space"("slug");

-- CreateIndex
CREATE INDEX "Space_hostId_idx" ON "Space"("hostId");

-- CreateIndex
CREATE INDEX "Space_isLive_idx" ON "Space"("isLive");

-- CreateIndex
CREATE INDEX "Space_createdAt_idx" ON "Space"("createdAt");

-- CreateIndex
CREATE INDEX "SpacePost_spaceId_idx" ON "SpacePost"("spaceId");

-- CreateIndex
CREATE INDEX "SpacePost_createdAt_idx" ON "SpacePost"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SpacePost_spaceId_atUri_key" ON "SpacePost"("spaceId", "atUri");

-- AddForeignKey
ALTER TABLE "Space" ADD CONSTRAINT "Space_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("did") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpacePost" ADD CONSTRAINT "SpacePost_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

