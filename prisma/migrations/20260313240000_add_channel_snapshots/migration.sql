-- CreateTable
CREATE TABLE "ChannelSnapshot" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "subscribers" BIGINT NOT NULL,
    "totalViews" BIGINT NOT NULL,
    "videoCount" INTEGER NOT NULL,
    "avgViews" INTEGER NOT NULL,
    "engagement" DOUBLE PRECISION NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelSnapshot_channelId_snapshotAt_idx" ON "ChannelSnapshot"("channelId", "snapshotAt");

-- AddForeignKey
ALTER TABLE "ChannelSnapshot" ADD CONSTRAINT "ChannelSnapshot_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
