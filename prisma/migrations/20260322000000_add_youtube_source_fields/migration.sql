-- AlterTable: Add nextCheckAt to ArticleSource for cadence-based polling
ALTER TABLE "ArticleSource" ADD COLUMN "nextCheckAt" TIMESTAMP(3);

-- AlterTable: Add parentArticleId to Article for story-split tracking
ALTER TABLE "Article" ADD COLUMN "parentArticleId" TEXT;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_parentArticleId_fkey" FOREIGN KEY ("parentArticleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Article_parentArticleId_idx" ON "Article"("parentArticleId");
