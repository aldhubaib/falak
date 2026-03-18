/*
  Warnings:

  - You are about to drop the column `gnewsApiKeyEncrypted` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `guardianApiKeyEncrypted` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `newsapiApiKeyEncrypted` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `nytApiKeyEncrypted` on the `Project` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Project" DROP COLUMN "gnewsApiKeyEncrypted",
DROP COLUMN "guardianApiKeyEncrypted",
DROP COLUMN "newsapiApiKeyEncrypted",
DROP COLUMN "nytApiKeyEncrypted";

-- CreateTable
CREATE TABLE "ApifyRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "datasetId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "itemCount" INTEGER,
    "status" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApifyRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApifyRun_sourceId_startedAt_idx" ON "ApifyRun"("sourceId", "startedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ApifyRun_sourceId_runId_key" ON "ApifyRun"("sourceId", "runId");

-- AddForeignKey
ALTER TABLE "ApifyRun" ADD CONSTRAINT "ApifyRun_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ArticleSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
