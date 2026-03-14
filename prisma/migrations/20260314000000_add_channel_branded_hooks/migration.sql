-- Add branded hooks to Channel (for "ours" channels only)
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "startHook" TEXT;
ALTER TABLE "Channel" ADD COLUMN IF NOT EXISTS "endHook" TEXT;
