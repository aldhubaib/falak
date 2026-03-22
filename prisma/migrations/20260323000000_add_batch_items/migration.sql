-- AlterTable: remove articleIds, add succeededCount
ALTER TABLE "PipelineBatch" DROP COLUMN "articleIds";
ALTER TABLE "PipelineBatch" ADD COLUMN "succeededCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PipelineBatchItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "durationMs" INTEGER,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PipelineBatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelineBatchItem_batchId_idx" ON "PipelineBatchItem"("batchId");

-- CreateIndex
CREATE INDEX "PipelineBatchItem_articleId_createdAt_idx" ON "PipelineBatchItem"("articleId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "PipelineBatchItem" ADD CONSTRAINT "PipelineBatchItem_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "PipelineBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
