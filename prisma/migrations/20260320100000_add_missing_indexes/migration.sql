-- Comment: composite index for top-comments queries (videoId + likeCount desc)
CREATE INDEX IF NOT EXISTS "Comment_videoId_likeCount_idx" ON "Comment"("videoId", "likeCount" DESC);

-- Story: index for rescore worker (channelId + lastRescoredAt)
CREATE INDEX IF NOT EXISTS "Story_channelId_lastRescoredAt_idx" ON "Story"("channelId", "lastRescoredAt");

-- Article: index for article listing sorted by createdAt desc
CREATE INDEX IF NOT EXISTS "Article_channelId_createdAt_idx" ON "Article"("channelId", "createdAt" DESC);
