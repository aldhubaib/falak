-- AlterTable: PipelineItem.result was in schema but never migrated
ALTER TABLE "PipelineItem" ADD COLUMN IF NOT EXISTS "result" JSONB;
