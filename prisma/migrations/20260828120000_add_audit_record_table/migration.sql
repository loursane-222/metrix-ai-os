CREATE TYPE "AuditRecordType" AS ENUM ('POLICY_DECISION', 'APPROVAL_EVENT', 'EXECUTION_ATTEMPT', 'ACTION_RESULT', 'CORRECTION');
CREATE TYPE "AuditOutcome" AS ENUM ('ALLOW', 'DENY', 'REQUIRES_APPROVAL', 'GRANTED', 'CONSUMED', 'REVOKED', 'VALIDATION_FAILED', 'ATTEMPTED', 'SUCCEEDED', 'NO_CHANGE', 'FAILED', 'CORRECTED');

CREATE TABLE "AuditRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recordType" "AuditRecordType" NOT NULL,
    "actionName" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "executionId" TEXT,
    "operationId" TEXT,
    "policyDecisionRef" TEXT,
    "approvalRef" TEXT,
    "outcome" "AuditOutcome" NOT NULL,
    "reasonCode" TEXT,
    "inputHash" TEXT,
    "resultSummary" TEXT,
    "correctsAuditId" TEXT,
    "correctedByAuditId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditRecord_organizationId_createdAt_idx" ON "AuditRecord"("organizationId", "createdAt");
CREATE INDEX "AuditRecord_organizationId_entityType_entityId_idx" ON "AuditRecord"("organizationId", "entityType", "entityId");
CREATE INDEX "AuditRecord_executionId_idx" ON "AuditRecord"("executionId");
CREATE INDEX "AuditRecord_operationId_idx" ON "AuditRecord"("operationId");

ALTER TABLE "AuditRecord"
ADD CONSTRAINT "AuditRecord_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
