-- CreateTable
CREATE TABLE "ExecutiveSignalSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "snapshotDate" TEXT NOT NULL,
    "snapshotType" TEXT NOT NULL,
    "overallRisk" TEXT NOT NULL,
    "snapshotPayload" JSONB NOT NULL,
    "escalationFrom" TEXT,
    "escalationTo" TEXT,
    "escalationKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutiveSignalSnapshot_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ExecutiveSignalSnapshot" ADD CONSTRAINT "ExecutiveSignalSnapshot_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex (standard)
CREATE INDEX "ExecutiveSignalSnapshot_organizationId_snapshotDate_idx"
    ON "ExecutiveSignalSnapshot"("organizationId", "snapshotDate");

CREATE INDEX "ExecutiveSignalSnapshot_organizationId_createdAt_idx"
    ON "ExecutiveSignalSnapshot"("organizationId", "createdAt");

-- CreateIndex (partial unique — Prisma schema cannot express WHERE clauses; defined here only)
CREATE UNIQUE INDEX "signal_snapshot_daily_anchor_unique"
    ON "ExecutiveSignalSnapshot" ("organizationId", "snapshotDate")
    WHERE "snapshotType" = 'DAILY_ANCHOR';

CREATE UNIQUE INDEX "signal_snapshot_escalation_unique"
    ON "ExecutiveSignalSnapshot" ("organizationId", "snapshotDate", "escalationKey")
    WHERE "snapshotType" = 'RISK_ESCALATION';
