-- CreateEnum
CREATE TYPE "CollectionActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "CollectionActionType" AS ENUM ('CALL', 'MEETING', 'LEGAL_NOTICE', 'REMINDER', 'NEGOTIATION', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "CollectionActionSource" AS ENUM ('AI_SUGGESTED', 'USER_CREATED');

-- CreateTable
CREATE TABLE "CollectionAction" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "paymentId"      TEXT NOT NULL,
    "title"          TEXT NOT NULL,
    "description"    TEXT,
    "actionType"     "CollectionActionType" NOT NULL,
    "status"         "CollectionActionStatus" NOT NULL DEFAULT 'OPEN',
    "source"         "CollectionActionSource" NOT NULL DEFAULT 'AI_SUGGESTED',
    "priority"       INTEGER NOT NULL DEFAULT 0,
    "aiReason"       TEXT,
    "dueDate"        TIMESTAMP(3),
    "completedAt"    TIMESTAMP(3),
    "dismissedAt"    TIMESTAMP(3),
    "notes"          TEXT,
    "metadata"       JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CollectionAction_organizationId_idx" ON "CollectionAction"("organizationId");

-- CreateIndex
CREATE INDEX "CollectionAction_organizationId_status_idx" ON "CollectionAction"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CollectionAction_paymentId_idx" ON "CollectionAction"("paymentId");

-- CreateIndex
CREATE INDEX "CollectionAction_paymentId_actionType_status_idx" ON "CollectionAction"("paymentId", "actionType", "status");

-- CreateIndex
CREATE INDEX "CollectionAction_createdAt_idx" ON "CollectionAction"("createdAt");

-- AddForeignKey
ALTER TABLE "CollectionAction" ADD CONSTRAINT "CollectionAction_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionAction" ADD CONSTRAINT "CollectionAction_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
