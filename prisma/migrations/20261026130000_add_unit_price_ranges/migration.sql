ALTER TABLE "projects"
  ADD COLUMN "unit_price_min" INTEGER,
  ADD COLUMN "unit_price_max" INTEGER;

ALTER TABLE "talents"
  ADD COLUMN "desired_price_min" INTEGER,
  ADD COLUMN "desired_price_max" INTEGER;
