-- CreateTable
CREATE TABLE "ApiUsage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "action" TEXT,
    "tokensUsed" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiUsage_projectId_createdAt_idx" ON "ApiUsage"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ApiUsage_service_idx" ON "ApiUsage"("service");
