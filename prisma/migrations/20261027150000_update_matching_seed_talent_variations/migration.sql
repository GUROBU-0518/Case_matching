WITH seed_details AS (
  SELECT * FROM (VALUES
    (0, ARRAY['Java', 'Spring Boot']::text[], '常駐', '2026年10月', ARRAY['要件定義', '設計']::text[]),
    (1, ARRAY['Python', 'Django']::text[], '週3リモート', '2026年11月', ARRAY['設計', '開発']::text[]),
    (2, ARRAY['AWS', 'Terraform']::text[], 'フルリモート', '2026年12月', ARRAY['構築', '運用保守']::text[]),
    (3, ARRAY['PHP', 'Laravel']::text[], '常駐・相談可', '即日', ARRAY['開発', 'テスト']::text[]),
    (4, ARRAY['Java', 'SQL']::text[], '週1リモート', '2027年1月', ARRAY['テスト', '運用保守']::text[]),
    (5, ARRAY['Java', 'React']::text[], 'フルリモート', '2026年11月', ARRAY['設計', '開発', 'テスト']::text[]),
    (6, ARRAY['Python', 'Docker']::text[], '週2リモート', '2026年12月', ARRAY['構築', 'テスト']::text[]),
    (7, ARRAY['AWS', 'Kotlin']::text[], '常駐', '即日', ARRAY['開発', '保守']::text[]),
    (8, ARRAY['PHP', 'C#']::text[], '週3リモート', '2027年2月', ARRAY['要件定義', '進捗管理']::text[]),
    (9, ARRAY['Java', 'Shell']::text[], '常駐・リモート相談可', '2026年11月', ARRAY['運用保守', '障害対応']::text[])
  ) AS details(pattern, skills, work_style, available_from, processes)
)
UPDATE "talents" AS talents
SET
  "technical_skills" = seed_details.skills,
  "desired_work_style" = seed_details.work_style,
  "available_from" = seed_details.available_from,
  "available_process" = seed_details.processes
FROM seed_details
WHERE talents."id" LIKE 'seed-talent-%'
  AND ((right(talents."id", 3)::integer - 1) % 10) = seed_details.pattern;
