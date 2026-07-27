CREATE TYPE "BusinessCandidateSourceChannel" AS ENUM (
  'TEXT', 'VOICE', 'WHATSAPP', 'OCR', 'MAIL', 'CRM_IMPORT', 'ERP_IMPORT', 'API', 'SYSTEM'
);

CREATE TYPE "BusinessCandidateOperation" AS ENUM (
  'CREATE', 'UPDATE', 'ENRICH', 'LINK', 'ARCHIVE'
);

CREATE TYPE "BusinessCandidateStatus" AS ENUM (
  'PROPOSED', 'RESOLVING', 'PENDING_APPROVAL', 'APPROVED',
  'PARTIALLY_APPROVED', 'PROMOTING', 'PROMOTED', 'REJECTED',
  'EXPIRED', 'FAILED'
);

CREATE TYPE "BusinessCandidateVerificationStatus" AS ENUM (
  'UNVERIFIED', 'NEEDS_CONFIRMATION', 'VERIFIED', 'REJECTED'
);

CREATE TYPE "BusinessCandidateConflictStatus" AS ENUM (
  'NONE', 'SAME_VALUE', 'CONFLICT', 'TARGET_NOT_FOUND', 'AMBIGUOUS_TARGET'
);

CREATE TYPE "BusinessCandidateApprovalStatus" AS ENUM (
  'PENDING', 'APPROVED', 'REJECTED'
);

CREATE TYPE "BusinessCandidatePromotionStatus" AS ENUM (
  'SUCCEEDED', 'FAILED'
);

CREATE TABLE "BusinessCandidate" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "conversationId" TEXT,
  "sourceChannel" "BusinessCandidateSourceChannel" NOT NULL,
  "sourceMessageId" TEXT,
  "sourceEventId" TEXT,
  "propositionType" TEXT NOT NULL,
  "targetDomain" TEXT NOT NULL,
  "targetRecordId" TEXT,
  "operation" "BusinessCandidateOperation" NOT NULL,
  "status" "BusinessCandidateStatus" NOT NULL DEFAULT 'PROPOSED',
  "confidence" DOUBLE PRECISION,
  "provenanceJson" JSONB NOT NULL,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
  "idempotencyKey" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "promotedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessCandidateChange" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "fieldPath" TEXT NOT NULL,
  "previousValue" JSONB,
  "proposedValue" JSONB NOT NULL,
  "verificationStatus" "BusinessCandidateVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "conflictStatus" "BusinessCandidateConflictStatus" NOT NULL DEFAULT 'NONE',
  "approvalStatus" "BusinessCandidateApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessCandidateChange_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessCandidateAudit" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "fromStatus" "BusinessCandidateStatus",
  "toStatus" "BusinessCandidateStatus" NOT NULL,
  "actorUserId" TEXT,
  "reasonCode" TEXT NOT NULL,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessCandidateAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessCandidatePromotionReceipt" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "approvedChangeIds" JSONB NOT NULL,
  "targetDomain" TEXT NOT NULL,
  "targetRecordId" TEXT,
  "canonicalOperation" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "actorUserId" TEXT,
  "systemAuthority" TEXT,
  "status" "BusinessCandidatePromotionStatus" NOT NULL,
  "errorCode" TEXT,
  "writtenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BusinessCandidatePromotionReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExecutiveRuntimeTraceRecord" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "conversationId" TEXT,
  "channel" TEXT NOT NULL,
  "schemaVersion" TEXT NOT NULL,
  "traceJson" JSONB NOT NULL,
  "redactionVersion" TEXT NOT NULL,
  "persistenceStatus" TEXT NOT NULL DEFAULT 'RECORDED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExecutiveRuntimeTraceRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessCandidate_organizationId_idempotencyKey_key"
  ON "BusinessCandidate"("organizationId", "idempotencyKey");
CREATE INDEX "BusinessCandidate_organizationId_status_idx"
  ON "BusinessCandidate"("organizationId", "status");
CREATE INDEX "BusinessCandidate_organizationId_targetDomain_targetRecordId_idx"
  ON "BusinessCandidate"("organizationId", "targetDomain", "targetRecordId");
CREATE INDEX "BusinessCandidate_conversationId_idx" ON "BusinessCandidate"("conversationId");
CREATE INDEX "BusinessCandidate_sourceMessageId_idx" ON "BusinessCandidate"("sourceMessageId");
CREATE INDEX "BusinessCandidate_expiresAt_idx" ON "BusinessCandidate"("expiresAt");

CREATE UNIQUE INDEX "BusinessCandidateChange_candidateId_fieldPath_key"
  ON "BusinessCandidateChange"("candidateId", "fieldPath");
CREATE INDEX "BusinessCandidateChange_candidateId_approvalStatus_idx"
  ON "BusinessCandidateChange"("candidateId", "approvalStatus");

CREATE INDEX "BusinessCandidateAudit_organizationId_createdAt_idx"
  ON "BusinessCandidateAudit"("organizationId", "createdAt");
CREATE INDEX "BusinessCandidateAudit_candidateId_createdAt_idx"
  ON "BusinessCandidateAudit"("candidateId", "createdAt");

CREATE UNIQUE INDEX "BusinessCandidatePromotionReceipt_organizationId_idempotencyKey_key"
  ON "BusinessCandidatePromotionReceipt"("organizationId", "idempotencyKey");
CREATE INDEX "BusinessCandidatePromotionReceipt_candidateId_writtenAt_idx"
  ON "BusinessCandidatePromotionReceipt"("candidateId", "writtenAt");
CREATE INDEX "BusinessCandidatePromotionReceipt_organizationId_executionId_idx"
  ON "BusinessCandidatePromotionReceipt"("organizationId", "executionId");

CREATE UNIQUE INDEX "ExecutiveRuntimeTraceRecord_organizationId_requestId_key"
  ON "ExecutiveRuntimeTraceRecord"("organizationId", "requestId");
CREATE INDEX "ExecutiveRuntimeTraceRecord_organizationId_createdAt_idx"
  ON "ExecutiveRuntimeTraceRecord"("organizationId", "createdAt");
CREATE INDEX "ExecutiveRuntimeTraceRecord_conversationId_createdAt_idx"
  ON "ExecutiveRuntimeTraceRecord"("conversationId", "createdAt");

ALTER TABLE "BusinessCandidate"
  ADD CONSTRAINT "BusinessCandidate_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessCandidateChange"
  ADD CONSTRAINT "BusinessCandidateChange_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "BusinessCandidate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessCandidateAudit"
  ADD CONSTRAINT "BusinessCandidateAudit_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessCandidateAudit"
  ADD CONSTRAINT "BusinessCandidateAudit_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "BusinessCandidate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BusinessCandidatePromotionReceipt"
  ADD CONSTRAINT "BusinessCandidatePromotionReceipt_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessCandidatePromotionReceipt"
  ADD CONSTRAINT "BusinessCandidatePromotionReceipt_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "BusinessCandidate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExecutiveRuntimeTraceRecord"
  ADD CONSTRAINT "ExecutiveRuntimeTraceRecord_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
