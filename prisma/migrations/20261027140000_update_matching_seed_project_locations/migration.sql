WITH seed_locations AS (
  SELECT * FROM (VALUES
    (1, '大森'), (2, '渋谷'), (3, '新宿'), (4, '東京'), (5, '品川'),
    (6, '横浜'), (7, '上野'), (8, '池袋'), (9, '大鳥居'), (10, '水戸')
  ) AS locations(i, station)
)
UPDATE "projects" AS projects
SET "location" = seed_locations.station
FROM seed_locations
WHERE projects."id" = 'seed-project-' || lpad(seed_locations.i::text, 3, '0');
