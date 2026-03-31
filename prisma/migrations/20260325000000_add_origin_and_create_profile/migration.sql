-- Add origin column to Story (default "ai" for existing stories)
ALTER TABLE "Story" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'ai';

-- Add canCreateProfile to User (default false)
ALTER TABLE "User" ADD COLUMN "canCreateProfile" BOOLEAN NOT NULL DEFAULT false;

-- Add styleGuide JSON column to Channel
ALTER TABLE "Channel" ADD COLUMN "styleGuide" JSONB;

-- Create AiGenerationLog table
CREATE TABLE "AiGenerationLog" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "storyId" TEXT,
    "action" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "systemPrompt" TEXT,
    "userPrompt" TEXT,
    "response" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "durationMs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiGenerationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiGenerationLog_channelId_createdAt_idx" ON "AiGenerationLog"("channelId", "createdAt" DESC);
CREATE INDEX "AiGenerationLog_storyId_idx" ON "AiGenerationLog"("storyId");
CREATE INDEX "AiGenerationLog_action_idx" ON "AiGenerationLog"("action");

ALTER TABLE "AiGenerationLog" ADD CONSTRAINT "AiGenerationLog_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
