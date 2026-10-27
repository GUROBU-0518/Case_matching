UPDATE "projects"
SET
  "unit_price_min" = "rate_min"::integer,
  "unit_price_max" = "rate_max"::integer
WHERE "unit_price_min" IS NULL
  AND "unit_price_max" IS NULL
  AND "rate_min" IS NOT NULL
  AND "rate_max" IS NOT NULL;

UPDATE "talents"
SET
  "desired_price_min" = "desired_rate_min"::integer,
  "desired_price_max" = "desired_rate_max"::integer
WHERE "desired_price_min" IS NULL
  AND "desired_price_max" IS NULL
  AND "desired_rate_min" IS NOT NULL
  AND "desired_rate_max" IS NOT NULL;
