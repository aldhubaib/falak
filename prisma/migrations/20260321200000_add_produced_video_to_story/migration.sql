-- AlterTable
ALTER TABLE "Story" ADD COLUMN "producedVideoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Story_producedVideoId_key" ON "Story"("producedVideoId");

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_producedVideoId_fkey" FOREIGN KEY ("producedVideoId") REFERENCES "Video"("id") ON DELETE SET NULL ON UPDATE CASCADE;
