WITH seed_values AS (
  SELECT
    i,
    CASE WHEN i <= 60 THEN
      CASE (i % 5) WHEN 1 THEN 750000 WHEN 2 THEN 550000 WHEN 3 THEN 850000 ELSE 750000 END
    ELSE CASE (i % 5) WHEN 1 THEN 300000 WHEN 2 THEN 1100000 WHEN 3 THEN 300000 WHEN 4 THEN 1100000 ELSE 300000 END END AS amount,
    CASE WHEN i <= 60 THEN
      CASE (i % 5) WHEN 1 THEN '75万円' WHEN 2 THEN '55万円' WHEN 3 THEN '85万円' ELSE '75万円' END
    ELSE CASE (i % 5) WHEN 1 THEN '30万円' WHEN 2 THEN '110万円' WHEN 3 THEN '30万円' WHEN 4 THEN '110万円' ELSE '30万円' END END AS rate_text,
    CASE (i % 5) WHEN 1 THEN '大鳥居' WHEN 2 THEN '初台' WHEN 3 THEN '南柏' WHEN 4 THEN '存在しない駅' ELSE '水戸' END AS station
  FROM generate_series(1, 100) AS series(i)
)
UPDATE "talents" AS talents
SET
  "desired_rate" = seed_values.rate_text,
  "desired_rate_min" = seed_values.amount,
  "desired_rate_max" = seed_values.amount,
  "desired_price_min" = seed_values.amount,
  "desired_price_max" = seed_values.amount,
  "nearest_station" = seed_values.station
FROM seed_values
WHERE talents."id" = 'seed-talent-' || lpad(seed_values.i::text, 3, '0');
