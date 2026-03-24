-- Move stories in 'publish' stage to 'filmed'
-- Valid stages after this migration: suggestion, liked, scripting, filmed, done, skip, trash, filtered
UPDATE "Story"
SET "stage" = 'filmed'
WHERE "stage" = 'publish';
