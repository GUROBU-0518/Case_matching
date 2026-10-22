ALTER TABLE "mail_messages" ADD COLUMN "processed_body" TEXT;
ALTER TABLE "ai_processings" ADD COLUMN "ai_status" VARCHAR(30);
ALTER TABLE "ai_processings" ADD CONSTRAINT "ai_processings_ai_status_check" CHECK ("ai_status" IS NULL OR "ai_status" IN ('processing', 'succeeded', 'failed_temporary', 'failed_permanent'));
