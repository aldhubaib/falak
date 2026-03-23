-- CreateTable
CREATE TABLE "TrendingSnapshot" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalVideos" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TrendingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendingEntry" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "youtubeVideoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "categoryId" TEXT,
    "categoryName" TEXT,
    "viewCount" BIGINT NOT NULL DEFAULT 0,
    "likeCount" BIGINT NOT NULL DEFAULT 0,
    "commentCount" BIGINT NOT NULL DEFAULT 0,
    "duration" TEXT,
    "publishedAt" TIMESTAMP(3),
    "thumbnailUrl" TEXT,

    CONSTRAINT "TrendingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrendingSnapshot_country_fetchedAt_idx" ON "TrendingSnapshot"("country", "fetchedAt" DESC);

-- CreateIndex
CREATE INDEX "TrendingEntry_snapshotId_idx" ON "TrendingEntry"("snapshotId");

-- CreateIndex
CREATE INDEX "TrendingEntry_youtubeVideoId_idx" ON "TrendingEntry"("youtubeVideoId");

-- CreateIndex
CREATE INDEX "TrendingEntry_categoryName_idx" ON "TrendingEntry"("categoryName");

-- AddForeignKey
ALTER TABLE "TrendingEntry" ADD CONSTRAINT "TrendingEntry_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "TrendingSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
