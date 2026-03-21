-- AlterTable
ALTER TABLE "ScoreProfile" ADD COLUMN "nicheTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ScoreProfile" ADD COLUMN "nicheTagsAr" TEXT[] DEFAULT ARRAY[]::TEXT[];
