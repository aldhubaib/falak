-- AlterTable
ALTER TABLE "Story" ADD COLUMN "writerId" TEXT;
ALTER TABLE "Story" ADD COLUMN "writerNotes" TEXT;

-- CreateIndex
CREATE INDEX "Story_writerId_idx" ON "Story"("writerId");

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_writerId_fkey" FOREIGN KEY ("writerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
