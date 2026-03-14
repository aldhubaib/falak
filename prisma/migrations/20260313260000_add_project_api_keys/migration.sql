-- Add per-project encrypted API key fields
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "anthropicApiKeyEncrypted"    TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "perplexityApiKeyEncrypted"   TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "ytTranscriptApiKeyEncrypted" TEXT;
