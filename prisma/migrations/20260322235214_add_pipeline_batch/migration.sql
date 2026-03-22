-- CreateTable
CREATE TABLE "PipelineBatch" (
    "id" TEXT NOT NULL,
    "pipeline" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "batchSeq" INTEGER NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "catchup" BOOLEAN NOT NULL DEFAULT false,
    "articleIds" TEXT[],
    "channelIds" TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PipelineBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelineBatch_pipeline_stage_finishedAt_idx" ON "PipelineBatch"("pipeline", "stage", "finishedAt" DESC);

-- CreateIndex
CREATE INDEX "PipelineBatch_channelIds_idx" ON "PipelineBatch"("channelIds");
