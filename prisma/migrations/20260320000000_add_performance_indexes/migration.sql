-- Composite indexes for Video queries (analytics, channel detail)
CREATE INDEX IF NOT EXISTS "Video_channelId_publishedAt_idx" ON "Video"("channelId", "publishedAt");
CREATE INDEX IF NOT EXISTS "Video_channelId_viewCount_idx" ON "Video"("channelId", "viewCount");

-- Composite indexes for Story queries (list, dashboard)
CREATE INDEX IF NOT EXISTS "Story_channelId_compositeScore_idx" ON "Story"("channelId", "compositeScore");
CREATE INDEX IF NOT EXISTS "Story_channelId_createdAt_idx" ON "Story"("channelId", "createdAt");

-- pgvector HNSW indexes for approximate nearest-neighbor search
-- These replace sequential scans on the embedding columns, reducing
-- similarity search from O(n) to O(log n).
CREATE INDEX IF NOT EXISTS "Video_embedding_hnsw_idx"
  ON "Video" USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS "Story_embedding_hnsw_idx"
  ON "Story" USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Session indexes for auth lookups and cleanup
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");

-- Article.storyId for join queries
CREATE INDEX IF NOT EXISTS "Article_storyId_idx" ON "Article"("storyId");
