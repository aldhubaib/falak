-- CreateTable
CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "youtubeId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rules" TEXT,
    "hashtag1" TEXT NOT NULL,
    "hashtag2" TEXT NOT NULL,
    "hashtag3" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Playlist_youtubeId_key" ON "Playlist"("youtubeId");

-- CreateIndex
CREATE INDEX "Playlist_channelId_idx" ON "Playlist"("channelId");

-- AddForeignKey
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
