CREATE TYPE "ActionApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'CONSUMED');
CREATE TYPE "ActionApprovalDecision" AS ENUM ('APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "ActionApproval" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actionName" TEXT NOT NULL,
    "targetEntityType" TEXT,
    "targetEntityId" TEXT,
    "normalizedInputHash" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "status" "ActionApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "decision" "ActionApprovalDecision",
    "decisionReason" TEXT,
    "consumedAt" TIMESTAMP(3),
    "correlationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ActionApproval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActionApproval_organizationId_actorUserId_idempotencyKey_key"
ON "ActionApproval"("organizationId", "actorUserId", "idempotencyKey");
CREATE INDEX "ActionApproval_organizationId_actorUserId_status_idx"
ON "ActionApproval"("organizationId", "actorUserId", "status");
CREATE INDEX "ActionApproval_organizationId_actionName_targetEntityType_targetEntityId_idx"
ON "ActionApproval"("organizationId", "actionName", "targetEntityType", "targetEntityId");
CREATE INDEX "ActionApproval_expiresAt_idx" ON "ActionApproval"("expiresAt");

ALTER TABLE "ActionApproval"
ADD CONSTRAINT "ActionApproval_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionApproval"
ADD CONSTRAINT "ActionApproval_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionApproval"
ADD CONSTRAINT "ActionApproval_decidedByUserId_fkey"
FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
