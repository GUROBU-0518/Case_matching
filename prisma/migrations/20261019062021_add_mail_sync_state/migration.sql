-- CreateTable
CREATE TABLE "mail_sync_states" (
    "id" TEXT NOT NULL,
    "mailbox_id" TEXT NOT NULL,
    "delta_link" TEXT NOT NULL,
    "last_synced_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "mail_sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mail_sync_states_mailbox_id_key" ON "mail_sync_states"("mailbox_id");
