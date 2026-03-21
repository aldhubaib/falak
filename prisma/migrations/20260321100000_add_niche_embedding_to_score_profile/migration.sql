-- AlterTable
ALTER TABLE "ScoreProfile" ADD COLUMN "nicheEmbedding" vector(1536);
ALTER TABLE "ScoreProfile" ADD COLUMN "nicheEmbeddingGeneratedAt" TIMESTAMP(3);
