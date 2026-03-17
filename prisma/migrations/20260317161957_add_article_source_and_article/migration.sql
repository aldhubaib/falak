-- CreateTable
CREATE TABLE "ArticleSource" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'en',
    "lastPolledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "content" TEXT,
    "contentClean" TEXT,
    "publishedAt" TIMESTAMP(3),
    "language" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'ingest',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "retries" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "analysis" JSONB,
    "relevanceScore" DOUBLE PRECISION,
    "rankScore" DOUBLE PRECISION,
    "rankReason" TEXT,
    "storyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArticleSource_projectId_idx" ON "ArticleSource"("projectId");

-- CreateIndex
CREATE INDEX "Article_sourceId_stage_idx" ON "Article"("sourceId", "stage");

-- CreateIndex
CREATE INDEX "Article_projectId_stage_idx" ON "Article"("projectId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "Article_projectId_url_key" ON "Article"("projectId", "url");

-- AddForeignKey
ALTER TABLE "ArticleSource" ADD CONSTRAINT "ArticleSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ArticleSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
