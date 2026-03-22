-- AlterTable
ALTER TABLE "Article" ADD COLUMN "category" TEXT,
ADD COLUMN "tags" JSONB,
ADD COLUMN "featuredImage" TEXT,
ADD COLUMN "images" JSONB;
