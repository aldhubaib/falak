-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "contentAr" TEXT,
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3),
ALTER COLUMN "stage" SET DEFAULT 'imported';

-- CreateIndex
CREATE INDEX "Article_stage_status_idx" ON "Article"("stage", "status");
