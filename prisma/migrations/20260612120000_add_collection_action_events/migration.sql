-- CreateEnum
CREATE TYPE "CollectionActionEventType" AS ENUM (
  'ACTION_CREATED',
  'STATUS_CHANGED',
  'CONTACT_LOGGED',
  'PAYMENT_PROMISED',
  'PAYMENT_DATE_SET',
  'PAYMENT_CONFIRMED',
  'NOTE_ADDED'
);

-- CreateTable
CREATE TABLE "CollectionActionEvent" (
    "id"                  TEXT NOT NULL,
    "organizationId"      TEXT NOT NULL,
    "collectionActionId"  TEXT NOT NULL,
    "conversationId"      TEXT,
    "eventType"           "CollectionActionEventType" NOT NULL,
    "fromStatus"          "CollectionActionStatus",
    "toStatus"            "CollectionActionStatus",
    "note"                TEXT,
    "expectedDate"        TIMESTAMP(3),
    "source"              "CollectionActionSource" NOT NULL DEFAULT 'AI_SUGGESTED',
    "metadata"            JSONB,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionActionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CollectionActionEvent_collectionActionId_idx"
    ON "CollectionActionEvent"("collectionActionId");

-- CreateIndex
CREATE INDEX "CollectionActionEvent_organizationId_createdAt_idx"
    ON "CollectionActionEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "CollectionActionEvent_collectionActionId_eventType_idx"
    ON "CollectionActionEvent"("collectionActionId", "eventType");

-- AddForeignKey
ALTER TABLE "CollectionActionEvent"
    ADD CONSTRAINT "CollectionActionEvent_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionActionEvent"
    ADD CONSTRAINT "CollectionActionEvent_collectionActionId_fkey"
    FOREIGN KEY ("collectionActionId") REFERENCES "CollectionAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
