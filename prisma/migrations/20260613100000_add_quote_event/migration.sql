-- CreateEnum
CREATE TYPE "QuoteEventType" AS ENUM (
  'QUOTE_CREATED',
  'QUOTE_SENT',
  'QUOTE_VIEWED',
  'QUOTE_FOLLOWED_UP',
  'QUOTE_NEGOTIATION_STARTED',
  'QUOTE_REVISION_REQUESTED',
  'QUOTE_WON',
  'QUOTE_LOST',
  'QUOTE_CANCELLED',
  'STATUS_CHANGED',
  'NOTE_ADDED'
);

-- CreateEnum
CREATE TYPE "QuoteEventSource" AS ENUM ('AI_SUGGESTED', 'USER_CREATED');

-- CreateTable
CREATE TABLE "QuoteEvent" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId"        TEXT NOT NULL,
    "conversationId" TEXT,
    "eventType"      "QuoteEventType" NOT NULL,
    "fromStatus"     "QuoteStatus",
    "toStatus"       "QuoteStatus",
    "note"           TEXT,
    "source"         "QuoteEventSource" NOT NULL DEFAULT 'AI_SUGGESTED',
    "metadata"       JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteEvent_quoteId_idx" ON "QuoteEvent"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteEvent_organizationId_createdAt_idx" ON "QuoteEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteEvent_quoteId_eventType_idx" ON "QuoteEvent"("quoteId", "eventType");

-- AddForeignKey
ALTER TABLE "QuoteEvent"
    ADD CONSTRAINT "QuoteEvent_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteEvent"
    ADD CONSTRAINT "QuoteEvent_quoteId_fkey"
    FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
