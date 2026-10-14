-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "project_name" TEXT,
    "summary" TEXT,
    "required_skills" TEXT[],
    "rate" TEXT,
    "location" TEXT,
    "work_style" TEXT,
    "start_date" TEXT,
    "headcount" INTEGER,
    "process" TEXT,
    "commercial_restrictions" TEXT,
    "source_text" TEXT,
    "mail_message_id" TEXT,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talents" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "name_or_initial" TEXT,
    "technical_skills" TEXT[],
    "desired_rate" TEXT,
    "nearest_station" TEXT,
    "desired_work_style" TEXT,
    "available_from" TEXT,
    "available_process" TEXT[],
    "affiliation" TEXT NOT NULL DEFAULT 'BP',
    "source_text" TEXT,
    "mail_message_id" TEXT,

    CONSTRAINT "talents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_messages" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "graph_message_id" TEXT NOT NULL,
    "mailbox_id" TEXT NOT NULL,
    "folder_id" TEXT,
    "subject" TEXT,
    "sender_address" TEXT,
    "received_at" TIMESTAMP(3),
    "graph_updated_at" TIMESTAMP(3),
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "source_info" TEXT,

    CONSTRAINT "mail_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_processings" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "graph_message_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "error_type" TEXT,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_retried_at" TIMESTAMP(3),
    "zod_validation_status" TEXT,
    "mail_message_id" TEXT,

    CONSTRAINT "ai_processings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_runs" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "target_mailbox_count" INTEGER NOT NULL,
    "target_count" INTEGER NOT NULL,
    "success_count" INTEGER NOT NULL,
    "failure_count" INTEGER NOT NULL,
    "error_message" TEXT,
    "exit_code" INTEGER,

    CONSTRAINT "batch_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mail_messages_graph_message_id_idx" ON "mail_messages"("graph_message_id");

-- CreateIndex
CREATE INDEX "mail_messages_mailbox_id_idx" ON "mail_messages"("mailbox_id");

-- CreateIndex
CREATE INDEX "mail_messages_received_at_idx" ON "mail_messages"("received_at");

-- CreateIndex
CREATE UNIQUE INDEX "mail_messages_mailbox_id_graph_message_id_key" ON "mail_messages"("mailbox_id", "graph_message_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_processings_mail_message_id_key" ON "ai_processings"("mail_message_id");

-- CreateIndex
CREATE INDEX "ai_processings_status_idx" ON "ai_processings"("status");

-- CreateIndex
CREATE INDEX "ai_processings_graph_message_id_idx" ON "ai_processings"("graph_message_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_mail_message_id_fkey" FOREIGN KEY ("mail_message_id") REFERENCES "mail_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "talents" ADD CONSTRAINT "talents_mail_message_id_fkey" FOREIGN KEY ("mail_message_id") REFERENCES "mail_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_processings" ADD CONSTRAINT "ai_processings_mail_message_id_fkey" FOREIGN KEY ("mail_message_id") REFERENCES "mail_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
