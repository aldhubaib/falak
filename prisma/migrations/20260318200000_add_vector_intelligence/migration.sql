-- Enable pgvector extension (requires pgvector-enabled PostgreSQL)
CREATE EXTENSION IF NOT EXISTS vector;

-- Project: embedding API key + rescore interval + last refresh timestamp
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "embeddingApiKeyEncrypted" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "lastStatsRefreshAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "rescoreIntervalHours" INTEGER DEFAULT 24;

-- Video: vector embedding column (1536 dimensions — OpenAI text-embedding-3-small)
ALTER TABLE "Video" ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Story: vector embedding + rescore tracking
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "lastRescoredAt" TIMESTAMP(3);
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "rescoreLog" JSONB;

-- ScoreProfile: self-learning scoring model (one per project)
CREATE TABLE IF NOT EXISTS "ScoreProfile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "weightAdjustments" JSONB,
    "tagSignals" JSONB,
    "contentTypeSignals" JSONB,
    "regionSignals" JSONB,
    "aiViralAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "aiRelevanceAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "channelAvgViews" BIGINT NOT NULL DEFAULT 0,
    "channelMedianViews" BIGINT NOT NULL DEFAULT 0,
    "totalOutcomes" INTEGER NOT NULL DEFAULT 0,
    "totalDecisions" INTEGER NOT NULL DEFAULT 0,
    "lastLearnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScoreProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ScoreProfile_projectId_key" ON "ScoreProfile"("projectId");

-- Alert: competitor alerts, score changes, trending topics
CREATE TABLE IF NOT EXISTS "Alert" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "storyId" TEXT,
    "videoId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Alert_projectId_isRead_idx" ON "Alert"("projectId", "isRead");
CREATE INDEX IF NOT EXISTS "Alert_projectId_createdAt_idx" ON "Alert"("projectId", "createdAt" DESC);

-- HNSW indexes for fast approximate nearest-neighbor search (scales to 100K+ vectors)
CREATE INDEX IF NOT EXISTS video_embedding_idx ON "Video" USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS story_embedding_idx ON "Story" USING hnsw (embedding vector_cosine_ops);

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "ScoreProfile" ADD CONSTRAINT "ScoreProfile_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Alert" ADD CONSTRAINT "Alert_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
