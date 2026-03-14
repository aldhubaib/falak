-- Add videoType column to Video table ('video' or 'short', detected from duration)
ALTER TABLE "Video" ADD COLUMN IF NOT EXISTS "videoType" TEXT NOT NULL DEFAULT 'video';

-- Back-fill existing rows: duration ≤ 60s → 'short', otherwise 'video'
UPDATE "Video"
SET "videoType" = CASE
  WHEN "duration" IS NULL THEN 'video'
  -- PT{n}S with n <= 60 (no minutes/hours)
  WHEN "duration" ~ '^PT([0-5]?[0-9]|60)S$' THEN 'short'
  -- PT1M exactly (= 60s)
  WHEN "duration" = 'PT1M' THEN 'short'
  ELSE 'video'
END;
