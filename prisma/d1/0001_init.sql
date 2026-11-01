-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "did" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Space" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "hostId" TEXT NOT NULL,
    "isLive" BOOLEAN NOT NULL DEFAULT false,
    "scheduledAt" DATETIME,
    "expiresAt" DATETIME,
    "emptySince" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "listenerCount" INTEGER NOT NULL DEFAULT 0,
    "speakerCount" INTEGER NOT NULL DEFAULT 0,
    "reactionCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,
    "totalListeners" INTEGER NOT NULL DEFAULT 0,
    "hostedSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastLiveAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Space_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User" ("did") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SpaceTag" (
    "spaceId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,

    PRIMARY KEY ("spaceId", "tag"),
    CONSTRAINT "SpaceTag_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Recording" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "egressId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'starting',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Bucket" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'audio/mpeg',
    "sizeBytes" INTEGER,
    "downloadUrl" TEXT,
    "hostDid" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Recording_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SpacePost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "atUri" TEXT NOT NULL,
    "cid" TEXT NOT NULL,
    "indexedAt" DATETIME NOT NULL,
    "authorDid" TEXT NOT NULL,
    "embed" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SpacePost_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OAuthSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "did" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OAuthState" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StageInvite" (
    "spaceId" TEXT NOT NULL,
    "targetIdentity" TEXT NOT NULL,
    "hostDid" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("spaceId", "targetIdentity"),
    CONSTRAINT "StageInvite_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StageSpeaker" (
    "spaceId" TEXT NOT NULL,
    "identity" TEXT NOT NULL,

    PRIMARY KEY ("spaceId", "identity"),
    CONSTRAINT "StageSpeaker_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StageBlock" (
    "spaceId" TEXT NOT NULL,
    "identity" TEXT NOT NULL,

    PRIMARY KEY ("spaceId", "identity"),
    CONSTRAINT "StageBlock_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShowSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "hostDid" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "peakListeners" INTEGER NOT NULL DEFAULT 0,
    "uniqueListeners" INTEGER NOT NULL DEFAULT 0,
    "guestCount" INTEGER NOT NULL DEFAULT 0,
    "reactionCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShowSession_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShowSessionTag" (
    "sessionId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,

    PRIMARY KEY ("sessionId", "tag"),
    CONSTRAINT "ShowSessionTag_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ShowSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShowParticipation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT NOT NULL DEFAULT 'listener',
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" DATETIME,
    "stageSeconds" INTEGER NOT NULL DEFAULT 0,
    "stageSince" DATETIME,
    CONSTRAINT "ShowParticipation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ShowSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShowReaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "sessionId" TEXT,
    "did" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'reaction',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShowReaction_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShowReaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ShowSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShowLike" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "spaceId" TEXT NOT NULL,
    "did" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShowLike_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HostTopicStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hostDid" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "showsHosted" INTEGER NOT NULL DEFAULT 0,
    "guestAppearances" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "reactions" INTEGER NOT NULL DEFAULT 0,
    "listeners" INTEGER NOT NULL DEFAULT 0,
    "hostedSeconds" INTEGER NOT NULL DEFAULT 0,
    "guestSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastLiveAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TopicStats" (
    "tag" TEXT NOT NULL PRIMARY KEY,
    "shows" INTEGER NOT NULL DEFAULT 0,
    "listeners" INTEGER NOT NULL DEFAULT 0,
    "reactions" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "hostedSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastLiveAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
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
CREATE INDEX "Space_status_idx" ON "Space"("status");

-- CreateIndex
CREATE INDEX "Space_scheduledAt_idx" ON "Space"("scheduledAt");

-- CreateIndex
CREATE INDEX "Space_expiresAt_idx" ON "Space"("expiresAt");

-- CreateIndex
CREATE INDEX "Space_emptySince_idx" ON "Space"("emptySince");

-- CreateIndex
CREATE INDEX "SpaceTag_tag_idx" ON "SpaceTag"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "Recording_egressId_key" ON "Recording"("egressId");

-- CreateIndex
CREATE INDEX "Recording_spaceId_idx" ON "Recording"("spaceId");

-- CreateIndex
CREATE INDEX "Recording_expiresAt_idx" ON "Recording"("expiresAt");

-- CreateIndex
CREATE INDEX "Recording_status_idx" ON "Recording"("status");

-- CreateIndex
CREATE INDEX "SpacePost_spaceId_idx" ON "SpacePost"("spaceId");

-- CreateIndex
CREATE INDEX "SpacePost_createdAt_idx" ON "SpacePost"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SpacePost_spaceId_atUri_key" ON "SpacePost"("spaceId", "atUri");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthSession_did_key" ON "OAuthSession"("did");

-- CreateIndex
CREATE INDEX "ShowSession_spaceId_startedAt_idx" ON "ShowSession"("spaceId", "startedAt");

-- CreateIndex
CREATE INDEX "ShowSession_hostDid_startedAt_idx" ON "ShowSession"("hostDid", "startedAt");

-- CreateIndex
CREATE INDEX "ShowSession_endedAt_idx" ON "ShowSession"("endedAt");

-- CreateIndex
CREATE INDEX "ShowSessionTag_tag_idx" ON "ShowSessionTag"("tag");

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

