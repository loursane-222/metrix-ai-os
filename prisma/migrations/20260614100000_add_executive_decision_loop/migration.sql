-- CreateEnum
CREATE TYPE "ExecutiveDecisionRecordSourceType" AS ENUM ('EXECUTIVE_BRAIN', 'ALERT', 'FORECAST_SIGNAL', 'RHYTHM');

-- CreateEnum
CREATE TYPE "ExecutiveDecisionRecordStatus" AS ENUM ('PROPOSED', 'COMMITTED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ExecutiveDecisionOutcomeType" AS ENUM ('SUCCESS', 'FAILURE', 'ABANDONED');

-- CreateTable
CREATE TABLE "ExecutiveDecisionRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "conversationId" TEXT,
    "sourceMessageId" TEXT,
    "aiMessageId" TEXT,
    "sourceType" "ExecutiveDecisionRecordSourceType" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceSnapshotId" TEXT,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "actionHint" TEXT,
    "category" TEXT,
    "priority" TEXT,
    "status" "ExecutiveDecisionRecordStatus" NOT NULL DEFAULT 'PROPOSED',
    "confidenceScore" DOUBLE PRECISION,
    "evidenceJson" JSONB,
    "sourcePayload" JSONB NOT NULL,
    "decisionDate" TEXT NOT NULL,
    "committedAt" TIMESTAMP(3),
    "followUpDueAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutiveDecisionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutiveDecisionOutcome" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "decisionRecordId" TEXT NOT NULL,
    "conversationId" TEXT,
    "sourceMessageId" TEXT,
    "outcome" "ExecutiveDecisionOutcomeType" NOT NULL,
    "summary" TEXT,
    "evidenceJson" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutiveDecisionOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExecutiveDecisionRecord_organizationId_decisionDate_sourceType_sourceKey_key"
    ON "ExecutiveDecisionRecord"("organizationId", "decisionDate", "sourceType", "sourceKey");

-- CreateIndex
CREATE INDEX "ExecutiveDecisionRecord_organizationId_idx" ON "ExecutiveDecisionRecord"("organizationId");

-- CreateIndex
CREATE INDEX "ExecutiveDecisionRecord_decisionDate_idx" ON "ExecutiveDecisionRecord"("decisionDate");

-- CreateIndex
CREATE INDEX "ExecutiveDecisionRecord_status_idx" ON "ExecutiveDecisionRecord"("status");

-- CreateIndex
CREATE INDEX "ExecutiveDecisionRecord_sourceSnapshotId_idx" ON "ExecutiveDecisionRecord"("sourceSnapshotId");

-- CreateIndex
CREATE INDEX "ExecutiveDecisionOutcome_organizationId_idx" ON "ExecutiveDecisionOutcome"("organizationId");

-- CreateIndex
CREATE INDEX "ExecutiveDecisionOutcome_decisionRecordId_idx" ON "ExecutiveDecisionOutcome"("decisionRecordId");

-- CreateIndex
CREATE INDEX "ExecutiveDecisionOutcome_occurredAt_idx" ON "ExecutiveDecisionOutcome"("occurredAt");

-- AddForeignKey
ALTER TABLE "ExecutiveDecisionRecord" ADD CONSTRAINT "ExecutiveDecisionRecord_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutiveDecisionRecord" ADD CONSTRAINT "ExecutiveDecisionRecord_sourceSnapshotId_fkey"
    FOREIGN KEY ("sourceSnapshotId") REFERENCES "ExecutiveSignalSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutiveDecisionOutcome" ADD CONSTRAINT "ExecutiveDecisionOutcome_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutiveDecisionOutcome" ADD CONSTRAINT "ExecutiveDecisionOutcome_decisionRecordId_fkey"
    FOREIGN KEY ("decisionRecordId") REFERENCES "ExecutiveDecisionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
