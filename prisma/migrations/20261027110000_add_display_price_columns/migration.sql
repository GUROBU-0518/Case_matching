ALTER TABLE "projects"
  ADD COLUMN "unit_price_min" INTEGER,
  ADD COLUMN "unit_price_max" INTEGER;

ALTER TABLE "talents"
  ADD COLUMN "desired_price_min" INTEGER,
  ADD COLUMN "desired_price_max" INTEGER;

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_unit_price_range_check"
  CHECK ("unit_price_min" IS NULL OR "unit_price_max" IS NULL OR "unit_price_min" <= "unit_price_max");

ALTER TABLE "talents"
  ADD CONSTRAINT "talents_desired_price_range_check"
  CHECK ("desired_price_min" IS NULL OR "desired_price_max" IS NULL OR "desired_price_min" <= "desired_price_max");
