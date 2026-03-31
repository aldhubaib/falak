-- Add origin column to Story (default "ai" for existing stories)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Story' AND column_name = 'origin') THEN
    ALTER TABLE "Story" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'ai';
  END IF;
END $$;

-- Add canCreateProfile to User (default false)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'canCreateProfile') THEN
    ALTER TABLE "User" ADD COLUMN "canCreateProfile" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

-- Add styleGuide JSON column to Channel
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Channel' AND column_name = 'styleGuide') THEN
    ALTER TABLE "Channel" ADD COLUMN "styleGuide" JSONB;
  END IF;
END $$;

-- Create AiGenerationLog table
CREATE TABLE IF NOT EXISTS "AiGenerationLog" (
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

CREATE INDEX IF NOT EXISTS "AiGenerationLog_channelId_createdAt_idx" ON "AiGenerationLog"("channelId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AiGenerationLog_storyId_idx" ON "AiGenerationLog"("storyId");
CREATE INDEX IF NOT EXISTS "AiGenerationLog_action_idx" ON "AiGenerationLog"("action");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'AiGenerationLog_channelId_fkey') THEN
    ALTER TABLE "AiGenerationLog" ADD CONSTRAINT "AiGenerationLog_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
