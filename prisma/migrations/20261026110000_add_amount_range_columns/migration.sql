ALTER TABLE "projects"
  ADD COLUMN "rate_min" BIGINT,
  ADD COLUMN "rate_max" BIGINT;

ALTER TABLE "talents"
  ADD COLUMN "desired_rate_min" BIGINT,
  ADD COLUMN "desired_rate_max" BIGINT;

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_rate_range_check"
  CHECK ("rate_min" IS NULL OR "rate_max" IS NULL OR "rate_min" <= "rate_max");

ALTER TABLE "talents"
  ADD CONSTRAINT "talents_desired_rate_range_check"
  CHECK ("desired_rate_min" IS NULL OR "desired_rate_max" IS NULL OR "desired_rate_min" <= "desired_rate_max");
