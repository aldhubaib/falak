-- Rename Article.rankScore to finalScore (scoring stage now produces finalScore)
ALTER TABLE "Article" RENAME COLUMN "rankScore" TO "finalScore";
