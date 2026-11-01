-- AlterTable
ALTER TABLE "Space" ADD COLUMN     "hostedSeconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastLiveAt" TIMESTAMP(3),
ADD COLUMN     "likeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sessionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalListeners" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ShowSession" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "hostDid" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "peakListeners" INTEGER NOT NULL DEFAULT 0,
    "uniqueListeners" INTEGER NOT NULL DEFAULT 0,
    "guestCount" INTEGER NOT NULL DEFAULT 0,
    "reactionCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShowSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowParticipation" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT NOT NULL DEFAULT 'listener',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "stageSeconds" INTEGER NOT NULL DEFAULT 0,
    "stageSince" TIMESTAMP(3),

    CONSTRAINT "ShowParticipation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowReaction" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "sessionId" TEXT,
    "did" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'reaction',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShowReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShowLike" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "did" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShowLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostTopicStats" (
    "id" TEXT NOT NULL,
    "hostDid" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "showsHosted" INTEGER NOT NULL DEFAULT 0,
    "guestAppearances" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "reactions" INTEGER NOT NULL DEFAULT 0,
    "listeners" INTEGER NOT NULL DEFAULT 0,
    "hostedSeconds" INTEGER NOT NULL DEFAULT 0,
    "guestSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastLiveAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostTopicStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicStats" (
    "tag" TEXT NOT NULL,
    "shows" INTEGER NOT NULL DEFAULT 0,
    "listeners" INTEGER NOT NULL DEFAULT 0,
    "reactions" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "hostedSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastLiveAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicStats_pkey" PRIMARY KEY ("tag")
);

-- CreateIndex
CREATE INDEX "ShowSession_spaceId_startedAt_idx" ON "ShowSession"("spaceId", "startedAt");

-- CreateIndex
CREATE INDEX "ShowSession_hostDid_startedAt_idx" ON "ShowSession"("hostDid", "startedAt");

-- CreateIndex
CREATE INDEX "ShowSession_endedAt_idx" ON "ShowSession"("endedAt");

-- CreateIndex
CREATE INDEX "ShowParticipation_identity_joinedAt_idx" ON "ShowParticipation"("identity", "joinedAt");

-- CreateIndex
CREATE INDEX "ShowParticipation_spaceId_idx" ON "ShowParticipation"("spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ShowParticipation_sessionId_identity_key" ON "ShowParticipation"("sessionId", "identity");

-- CreateIndex
CREATE INDEX "ShowReaction_spaceId_createdAt_idx" ON "ShowReaction"("spaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ShowReaction_sessionId_idx" ON "ShowReaction"("sessionId");

-- CreateIndex
CREATE INDEX "ShowReaction_did_idx" ON "ShowReaction"("did");

-- CreateIndex
CREATE INDEX "ShowLike_did_idx" ON "ShowLike"("did");

-- CreateIndex
CREATE UNIQUE INDEX "ShowLike_spaceId_did_key" ON "ShowLike"("spaceId", "did");

-- CreateIndex
CREATE INDEX "HostTopicStats_tag_listeners_idx" ON "HostTopicStats"("tag", "listeners");

-- CreateIndex
CREATE INDEX "HostTopicStats_tag_hostedSeconds_idx" ON "HostTopicStats"("tag", "hostedSeconds");

-- CreateIndex
CREATE UNIQUE INDEX "HostTopicStats_hostDid_tag_key" ON "HostTopicStats"("hostDid", "tag");

-- AddForeignKey
ALTER TABLE "ShowSession" ADD CONSTRAINT "ShowSession_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowParticipation" ADD CONSTRAINT "ShowParticipation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ShowSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowReaction" ADD CONSTRAINT "ShowReaction_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowReaction" ADD CONSTRAINT "ShowReaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ShowSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShowLike" ADD CONSTRAINT "ShowLike_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

