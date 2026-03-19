-- Migration: Remove Projects, make Channels top-level
-- Each "ours" channel becomes a profile; competitors get parentChannelId pointing to their "ours" channel.

-- 1. Add new columns to Channel
ALTER TABLE "Channel" ADD COLUMN "parentChannelId" TEXT;
ALTER TABLE "Channel" ADD COLUMN "color" TEXT NOT NULL DEFAULT '#3b82f6';
ALTER TABLE "Channel" ADD COLUMN "lastStatsRefreshAt" TIMESTAMP(3);
ALTER TABLE "Channel" ADD COLUMN "rescoreIntervalHours" INTEGER DEFAULT 24;

-- 2. For each project, find the first "ours" channel and use it as the profile.
--    Link competitors to their project's first "ours" channel.
UPDATE "Channel" c
SET "parentChannelId" = sub.ours_id
FROM (
  SELECT c2.id AS comp_id, first_ours.id AS ours_id
  FROM "Channel" c2
  JOIN LATERAL (
    SELECT id FROM "Channel"
    WHERE "projectId" = c2."projectId" AND "type" = 'ours'
    ORDER BY "createdAt" ASC
    LIMIT 1
  ) first_ours ON true
  WHERE c2."type" = 'competitor'
) sub
WHERE c.id = sub.comp_id;

-- 3. Copy project-level fields to the "ours" channels
UPDATE "Channel" c
SET
  "color" = p."color",
  "lastStatsRefreshAt" = p."lastStatsRefreshAt",
  "rescoreIntervalHours" = p."rescoreIntervalHours"
FROM "Project" p
WHERE c."projectId" = p.id AND c."type" = 'ours';

-- 4. Add channelId to Story (rename from projectId)
ALTER TABLE "Story" ADD COLUMN "channelId" TEXT;
UPDATE "Story" s
SET "channelId" = sub.ours_id
FROM (
  SELECT p.id AS project_id, first_ours.id AS ours_id
  FROM "Project" p
  JOIN LATERAL (
    SELECT id FROM "Channel"
    WHERE "projectId" = p.id AND "type" = 'ours'
    ORDER BY "createdAt" ASC
    LIMIT 1
  ) first_ours ON true
) sub
WHERE s."projectId" = sub.project_id;
-- Stories with no matching "ours" channel (orphaned) — assign to any channel in that project
UPDATE "Story" s
SET "channelId" = sub.any_ch
FROM (
  SELECT p.id AS project_id, (SELECT id FROM "Channel" WHERE "projectId" = p.id ORDER BY "createdAt" ASC LIMIT 1) AS any_ch
  FROM "Project" p
) sub
WHERE s."channelId" IS NULL AND s."projectId" = sub.project_id AND sub.any_ch IS NOT NULL;
ALTER TABLE "Story" ALTER COLUMN "channelId" SET NOT NULL;

-- 5. Add channelId to ArticleSource
ALTER TABLE "ArticleSource" ADD COLUMN "channelId" TEXT;
UPDATE "ArticleSource" a
SET "channelId" = sub.ours_id
FROM (
  SELECT p.id AS project_id, first_ours.id AS ours_id
  FROM "Project" p
  JOIN LATERAL (
    SELECT id FROM "Channel"
    WHERE "projectId" = p.id AND "type" = 'ours'
    ORDER BY "createdAt" ASC
    LIMIT 1
  ) first_ours ON true
) sub
WHERE a."projectId" = sub.project_id;
UPDATE "ArticleSource" a
SET "channelId" = sub.any_ch
FROM (
  SELECT p.id AS project_id, (SELECT id FROM "Channel" WHERE "projectId" = p.id ORDER BY "createdAt" ASC LIMIT 1) AS any_ch
  FROM "Project" p
) sub
WHERE a."channelId" IS NULL AND a."projectId" = sub.project_id AND sub.any_ch IS NOT NULL;
ALTER TABLE "ArticleSource" ALTER COLUMN "channelId" SET NOT NULL;

-- 6. Add channelId to ScoreProfile
ALTER TABLE "ScoreProfile" ADD COLUMN "channelId" TEXT;
UPDATE "ScoreProfile" sp
SET "channelId" = sub.ours_id
FROM (
  SELECT p.id AS project_id, first_ours.id AS ours_id
  FROM "Project" p
  JOIN LATERAL (
    SELECT id FROM "Channel"
    WHERE "projectId" = p.id AND "type" = 'ours'
    ORDER BY "createdAt" ASC
    LIMIT 1
  ) first_ours ON true
) sub
WHERE sp."projectId" = sub.project_id;
DELETE FROM "ScoreProfile" WHERE "channelId" IS NULL;
ALTER TABLE "ScoreProfile" ALTER COLUMN "channelId" SET NOT NULL;

-- 7. Add channelId to Alert
ALTER TABLE "Alert" ADD COLUMN "channelId" TEXT;
UPDATE "Alert" a
SET "channelId" = sub.ours_id
FROM (
  SELECT p.id AS project_id, first_ours.id AS ours_id
  FROM "Project" p
  JOIN LATERAL (
    SELECT id FROM "Channel"
    WHERE "projectId" = p.id AND "type" = 'ours'
    ORDER BY "createdAt" ASC
    LIMIT 1
  ) first_ours ON true
) sub
WHERE a."projectId" = sub.project_id;
DELETE FROM "Alert" WHERE "channelId" IS NULL;
ALTER TABLE "Alert" ALTER COLUMN "channelId" SET NOT NULL;

-- 8. Rename projectId to channelId in ApiUsage
ALTER TABLE "ApiUsage" RENAME COLUMN "projectId" TO "channelId";

-- 9. Rename projectId to channelId in Article
ALTER TABLE "Article" ADD COLUMN "channelId" TEXT;
UPDATE "Article" art
SET "channelId" = asrc."channelId"
FROM "ArticleSource" asrc
WHERE art."sourceId" = asrc.id;
UPDATE "Article" SET "channelId" = '' WHERE "channelId" IS NULL;
ALTER TABLE "Article" ALTER COLUMN "channelId" SET NOT NULL;

-- 10. Rename projectAccess to channelAccess in User
ALTER TABLE "User" RENAME COLUMN "projectAccess" TO "channelAccess";

-- 11. Migrate project API keys to global ApiKey table
INSERT INTO "ApiKey" (id, service, "encryptedKey", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'anthropic', "anthropicApiKeyEncrypted", true, now(), now()
FROM "Project" WHERE "anthropicApiKeyEncrypted" IS NOT NULL
LIMIT 1
ON CONFLICT (service) DO NOTHING;

INSERT INTO "ApiKey" (id, service, "encryptedKey", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'perplexity', "perplexityApiKeyEncrypted", true, now(), now()
FROM "Project" WHERE "perplexityApiKeyEncrypted" IS NOT NULL
LIMIT 1
ON CONFLICT (service) DO NOTHING;

INSERT INTO "ApiKey" (id, service, "encryptedKey", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'firecrawl', "firecrawlApiKeyEncrypted", true, now(), now()
FROM "Project" WHERE "firecrawlApiKeyEncrypted" IS NOT NULL
LIMIT 1
ON CONFLICT (service) DO NOTHING;

INSERT INTO "ApiKey" (id, service, "encryptedKey", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'yt-transcript', "ytTranscriptApiKeyEncrypted", true, now(), now()
FROM "Project" WHERE "ytTranscriptApiKeyEncrypted" IS NOT NULL
LIMIT 1
ON CONFLICT (service) DO NOTHING;

INSERT INTO "ApiKey" (id, service, "encryptedKey", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'embedding', "embeddingApiKeyEncrypted", true, now(), now()
FROM "Project" WHERE "embeddingApiKeyEncrypted" IS NOT NULL
LIMIT 1
ON CONFLICT (service) DO NOTHING;

-- 12. Drop old indexes and constraints
DROP INDEX IF EXISTS "Channel_projectId_idx";
DROP INDEX IF EXISTS "Story_projectId_stage_idx";
DROP INDEX IF EXISTS "ArticleSource_projectId_idx";
DROP INDEX IF EXISTS "Alert_projectId_isRead_idx";
DROP INDEX IF EXISTS "Alert_projectId_createdAt_idx";
DROP INDEX IF EXISTS "ApiUsage_projectId_createdAt_idx";
DROP INDEX IF EXISTS "Article_projectId_url_key";
DROP INDEX IF EXISTS "Article_projectId_stage_idx";
DROP INDEX IF EXISTS "ScoreProfile_projectId_key";

-- 13. Drop old columns
ALTER TABLE "Story" DROP COLUMN "projectId";
ALTER TABLE "ArticleSource" DROP COLUMN "projectId";
ALTER TABLE "ScoreProfile" DROP COLUMN "projectId";
ALTER TABLE "Alert" DROP COLUMN "projectId";
ALTER TABLE "Article" DROP COLUMN "projectId";
ALTER TABLE "Channel" DROP COLUMN "projectId";

-- 14. Create new indexes and constraints
CREATE INDEX "Channel_parentChannelId_idx" ON "Channel"("parentChannelId");
CREATE INDEX "Story_channelId_stage_idx" ON "Story"("channelId", "stage");
CREATE INDEX "ArticleSource_channelId_idx" ON "ArticleSource"("channelId");
CREATE INDEX "Alert_channelId_isRead_idx" ON "Alert"("channelId", "isRead");
CREATE INDEX "Alert_channelId_createdAt_idx" ON "Alert"("channelId", "createdAt" DESC);
CREATE INDEX "ApiUsage_channelId_createdAt_idx" ON "ApiUsage"("channelId", "createdAt" DESC);
CREATE UNIQUE INDEX "Article_channelId_url_key" ON "Article"("channelId", "url");
CREATE INDEX "Article_channelId_stage_idx" ON "Article"("channelId", "stage");
CREATE UNIQUE INDEX "ScoreProfile_channelId_key" ON "ScoreProfile"("channelId");

-- 15. Add foreign keys
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_parentChannelId_fkey" FOREIGN KEY ("parentChannelId") REFERENCES "Channel"(id) ON DELETE CASCADE;
ALTER TABLE "Story" ADD CONSTRAINT "Story_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"(id) ON DELETE CASCADE;
ALTER TABLE "ArticleSource" ADD CONSTRAINT "ArticleSource_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"(id) ON DELETE CASCADE;
ALTER TABLE "ScoreProfile" ADD CONSTRAINT "ScoreProfile_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"(id) ON DELETE CASCADE;
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"(id) ON DELETE CASCADE;

-- 16. Drop old foreign keys (Story, ArticleSource, ScoreProfile, Alert, Channel → Project)
ALTER TABLE "Story" DROP CONSTRAINT IF EXISTS "Story_projectId_fkey";
ALTER TABLE "ArticleSource" DROP CONSTRAINT IF EXISTS "ArticleSource_projectId_fkey";
ALTER TABLE "ScoreProfile" DROP CONSTRAINT IF EXISTS "ScoreProfile_projectId_fkey";
ALTER TABLE "Alert" DROP CONSTRAINT IF EXISTS "Alert_projectId_fkey";
ALTER TABLE "Channel" DROP CONSTRAINT IF EXISTS "Channel_projectId_fkey";

-- 17. Drop Project table
DROP TABLE IF EXISTS "Project";

-- 18. Change default type for existing "ours" channels (already correct)
-- New channels created via profile picker default to "ours"
