-- AlterTable
ALTER TABLE "ScoreProfile" ADD COLUMN "storyPatterns" JSONB;

-- Migrate existing articles from story_detect to story_count
UPDATE "Article" SET "stage" = 'story_count' WHERE "stage" = 'story_detect';
