-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "gnewsApiKeyEncrypted" TEXT,
ADD COLUMN     "guardianApiKeyEncrypted" TEXT,
ADD COLUMN     "newsapiApiKeyEncrypted" TEXT,
ADD COLUMN     "nytApiKeyEncrypted" TEXT;
