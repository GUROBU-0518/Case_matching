-- Preserve existing timestamp-without-time-zone values as UTC instants.
ALTER TABLE "ai_processings"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "status" TYPE VARCHAR(30),
  ALTER COLUMN "started_at" TYPE TIMESTAMPTZ(3) USING "started_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "ended_at" TYPE TIMESTAMPTZ(3) USING "ended_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "error_type" TYPE VARCHAR(30),
  ALTER COLUMN "last_retried_at" TYPE TIMESTAMPTZ(3) USING "last_retried_at" AT TIME ZONE 'UTC';

ALTER TABLE "batch_runs"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "started_at" TYPE TIMESTAMPTZ(3) USING "started_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "ended_at" TYPE TIMESTAMPTZ(3) USING "ended_at" AT TIME ZONE 'UTC';

ALTER TABLE "mail_messages"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "subject" TYPE VARCHAR(500),
  ALTER COLUMN "sender_address" TYPE VARCHAR(320),
  ALTER COLUMN "received_at" TYPE TIMESTAMPTZ(3) USING "received_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "graph_updated_at" TYPE TIMESTAMPTZ(3) USING "graph_updated_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "fetched_at" TYPE TIMESTAMPTZ(3) USING "fetched_at" AT TIME ZONE 'UTC';

ALTER TABLE "projects"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "project_name" TYPE VARCHAR(255);

ALTER TABLE "talents"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "name_or_initial" TYPE VARCHAR(100);
