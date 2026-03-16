-- Move stories in 'approved' or any invalid stage to 'suggestion' (AI Suggestion)
-- Valid stages: suggestion, liked, scripting, filmed, publish, done, passed, omit
UPDATE "Story"
SET "stage" = 'suggestion'
WHERE "stage" = 'approved'
   OR "stage" NOT IN ('suggestion', 'liked', 'scripting', 'filmed', 'publish', 'done', 'passed', 'omit');
