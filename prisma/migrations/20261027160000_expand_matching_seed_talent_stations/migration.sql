WITH seed_stations AS (
  SELECT * FROM (VALUES
    (0, '大鳥居'), (1, '初台'), (2, '南柏'), (3, '存在しない駅'), (4, '水戸'),
    (5, '渋谷'), (6, '新宿'), (7, '東京'), (8, '品川'), (9, '横浜'),
    (10, '上野'), (11, '池袋'), (12, '秋葉原'), (13, '目黒'), (14, '蒲田'),
    (15, '川崎'), (16, '千葉'), (17, '大宮'), (18, '立川'), (19, '八王子')
  ) AS stations(pattern, station)
)
UPDATE "talents" AS talents
SET "nearest_station" = seed_stations.station
FROM seed_stations
WHERE talents."id" LIKE 'seed-talent-%'
  AND ((right(talents."id", 3)::integer - 1) % 20) = seed_stations.pattern;
