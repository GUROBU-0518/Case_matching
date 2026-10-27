INSERT INTO "projects" (
  "id", "created_at", "updated_at", "project_name", "required_skills", "rate", "rate_min", "rate_max",
  "unit_price_min", "unit_price_max", "location", "work_style", "start_date",
  "process", "source_text"
)
SELECT
  'seed-project-' || lpad(i::text, 3, '0'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  '【SEED-P' || lpad(i::text, 3, '0') || '】サンプル案件' || lpad(i::text, 3, '0'),
  ARRAY[CASE ((i - 1) % 5) WHEN 0 THEN 'Java' WHEN 1 THEN 'Python' WHEN 2 THEN 'AWS' WHEN 3 THEN 'PHP' ELSE 'Java' END]::text[],
  CASE ((i - 1) % 5) WHEN 0 THEN '70〜85万円' WHEN 1 THEN '50〜60万円' WHEN 2 THEN '80〜90万円' WHEN 3 THEN '40〜55万円' ELSE '90〜100万円' END,
  CASE ((i - 1) % 5) WHEN 0 THEN 700000 WHEN 1 THEN 500000 WHEN 2 THEN 800000 WHEN 3 THEN 400000 ELSE 900000 END,
  CASE ((i - 1) % 5) WHEN 0 THEN 850000 WHEN 1 THEN 600000 WHEN 2 THEN 900000 WHEN 3 THEN 550000 ELSE 1000000 END,
  CASE ((i - 1) % 5) WHEN 0 THEN 700000 WHEN 1 THEN 500000 WHEN 2 THEN 800000 WHEN 3 THEN 400000 ELSE 900000 END,
  CASE ((i - 1) % 5) WHEN 0 THEN 850000 WHEN 1 THEN 600000 WHEN 2 THEN 900000 WHEN 3 THEN 550000 ELSE 1000000 END,
  '大森', '基本リモート', '2026年11月', '設計、開発、テスト',
  '【SEED-P' || lpad(i::text, 3, '0') || '】シード登録用の案件原文です。'
FROM generate_series(1, 10) AS series(i)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "talents" (
  "id", "created_at", "updated_at", "name_or_initial", "technical_skills", "desired_rate", "desired_rate_min", "desired_rate_max",
  "desired_price_min", "desired_price_max", "nearest_station", "desired_work_style", "available_from",
  "available_process", "affiliation", "source_text"
)
SELECT
  'seed-talent-' || lpad(i::text, 3, '0'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  '【SEED-T' || lpad(i::text, 3, '0') || '】シード人材' || lpad(i::text, 3, '0'),
  ARRAY[CASE WHEN i <= 50 THEN CASE (i % 3) WHEN 1 THEN 'Java' WHEN 2 THEN 'Python' ELSE 'AWS' END ELSE CASE WHEN i % 2 = 0 THEN '未経験' ELSE 'Rust' END END]::text[],
  CASE WHEN i <= 50 THEN CASE (i % 3) WHEN 1 THEN '75万円' WHEN 2 THEN '55万円' ELSE '85万円' END ELSE CASE WHEN i % 2 = 0 THEN '30万円' ELSE '110万円' END END,
  CASE WHEN i <= 50 THEN CASE (i % 3) WHEN 1 THEN 750000 WHEN 2 THEN 550000 ELSE 850000 END ELSE CASE WHEN i % 2 = 0 THEN 300000 ELSE 1100000 END END,
  CASE WHEN i <= 50 THEN CASE (i % 3) WHEN 1 THEN 750000 WHEN 2 THEN 550000 ELSE 850000 END ELSE CASE WHEN i % 2 = 0 THEN 300000 ELSE 1100000 END END,
  CASE WHEN i <= 50 THEN CASE (i % 3) WHEN 1 THEN 750000 WHEN 2 THEN 550000 ELSE 850000 END ELSE CASE WHEN i % 2 = 0 THEN 300000 ELSE 1100000 END END,
  CASE WHEN i <= 50 THEN CASE (i % 3) WHEN 1 THEN 750000 WHEN 2 THEN 550000 ELSE 850000 END ELSE CASE WHEN i % 2 = 0 THEN 300000 ELSE 1100000 END END,
  CASE WHEN i <= 50 THEN '大鳥居' ELSE '存在しない駅' END,
  '常駐・リモート相談可', '2026年11月', ARRAY['設計', '開発', 'テスト']::text[], 'BP',
  '【SEED-T' || lpad(i::text, 3, '0') || '】シード登録用の人材原文です。'
FROM generate_series(1, 100) AS series(i)
ON CONFLICT ("id") DO NOTHING;
