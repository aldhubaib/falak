-- CreateTable
CREATE TABLE "TopicMemory" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "topicKey" TEXT NOT NULL,
    "topicLabel" TEXT,
    "winsCount" INTEGER NOT NULL DEFAULT 0,
    "lateCount" INTEGER NOT NULL DEFAULT 0,
    "videosCount" INTEGER NOT NULL DEFAULT 0,
    "viewsSum" BIGINT NOT NULL DEFAULT 0,
    "performanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastOutcomeAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicMemoryEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "topicKey" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "views" BIGINT NOT NULL DEFAULT 0,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicMemoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TopicMemory_projectId_topicKey_key" ON "TopicMemory"("projectId", "topicKey");

-- CreateIndex
CREATE INDEX "TopicMemory_projectId_idx" ON "TopicMemory"("projectId");

-- CreateIndex
CREATE INDEX "TopicMemory_projectId_weight_idx" ON "TopicMemory"("projectId", "weight");

-- CreateIndex
CREATE INDEX "TopicMemory_projectId_lastSeenAt_idx" ON "TopicMemory"("projectId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "TopicMemoryEvent_videoId_topicKey_outcome_key" ON "TopicMemoryEvent"("videoId", "topicKey", "outcome");

-- CreateIndex
CREATE INDEX "TopicMemoryEvent_projectId_occurredAt_idx" ON "TopicMemoryEvent"("projectId", "occurredAt");
