-- CreateTable
CREATE TABLE "Dialect" (
    "id" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "engine" TEXT NOT NULL DEFAULT 'claude',
    "name" TEXT NOT NULL,
    "short" TEXT NOT NULL,
    "long" TEXT NOT NULL,

    CONSTRAINT "Dialect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Dialect_engine_idx" ON "Dialect"("engine");

-- CreateIndex
CREATE UNIQUE INDEX "Dialect_countryCode_engine_key" ON "Dialect"("countryCode", "engine");
