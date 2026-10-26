ALTER TABLE "projects" ADD COLUMN "nearest_station" TEXT;
ALTER TABLE "projects" ADD COLUMN "preferred_skills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "talents" ADD COLUMN "available_period" TEXT;
ALTER TABLE "talents" ADD COLUMN "age" TEXT;
ALTER TABLE "talents" ADD COLUMN "years_of_experience" TEXT;
ALTER TABLE "talents" ADD COLUMN "notes" TEXT;
ALTER TABLE "talents" ADD COLUMN "affiliation_type" VARCHAR(20) NOT NULL DEFAULT 'unknown';
ALTER TABLE "talents" ADD CONSTRAINT "talents_affiliation_type_check" CHECK ("affiliation_type" IN ('employee', 'freelance', 'unknown'));
