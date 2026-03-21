-- CreateTable
CREATE TABLE "GoogleSearchKey" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Key 1',
    "encryptedKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleSearchKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoogleSearchKey_isActive_idx" ON "GoogleSearchKey"("isActive");
