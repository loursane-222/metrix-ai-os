-- CreateEnum
CREATE TYPE "MemoryItemType" AS ENUM ('FACT', 'PREFERENCE', 'PROCESS', 'STRATEGIC');

-- CreateEnum
CREATE TYPE "MemoryItemSource" AS ENUM ('USER_PROVIDED', 'USER_CORRECTION', 'CANDIDATE_APPROVED', 'ONBOARDING', 'SYSTEM_INFERRED', 'EVENT_DERIVED');

-- CreateEnum
CREATE TYPE "MemoryItemStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'DELETED');

-- CreateEnum
CREATE TYPE "MemorySubjectType" AS ENUM ('ORGANIZATION', 'USER', 'PROCESS', 'STRATEGY');

-- CreateEnum
CREATE TYPE "MemoryCandidateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DISMISSED', 'EXPIRED');

-- CreateTable
CREATE TABLE "MemoryItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "deletedByUserId" TEXT,
    "subjectType" "MemorySubjectType" NOT NULL,
    "subjectId" TEXT,
    "type" "MemoryItemType" NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" "MemoryItemSource" NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 100,
    "status" "MemoryItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "isUserConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "sourceEventId" TEXT,
    "sourceCandidateId" TEXT,
    "supersedesMemoryId" TEXT,
    "metadata" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryCandidate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "reviewedByUserId" TEXT,
    "subjectType" "MemorySubjectType" NOT NULL,
    "subjectId" TEXT,
    "proposedType" "MemoryItemType" NOT NULL,
    "proposedKey" TEXT NOT NULL,
    "proposedValue" TEXT NOT NULL,
    "source" "MemoryItemSource" NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 70,
    "isAssumption" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT NOT NULL,
    "evidenceJson" JSONB,
    "metadata" JSONB,
    "sourceEventId" TEXT,
    "sourceMessageId" TEXT,
    "status" "MemoryCandidateStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemoryItem_organizationId_idx" ON "MemoryItem"("organizationId");

-- CreateIndex
CREATE INDEX "MemoryItem_organizationId_status_idx" ON "MemoryItem"("organizationId", "status");

-- CreateIndex
CREATE INDEX "MemoryItem_organizationId_type_idx" ON "MemoryItem"("organizationId", "type");

-- CreateIndex
CREATE INDEX "MemoryItem_organizationId_subjectType_subjectId_idx" ON "MemoryItem"("organizationId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "MemoryItem_organizationId_key_idx" ON "MemoryItem"("organizationId", "key");

-- CreateIndex
CREATE INDEX "MemoryItem_organizationId_status_type_idx" ON "MemoryItem"("organizationId", "status", "type");

-- CreateIndex
CREATE INDEX "MemoryItem_sourceCandidateId_idx" ON "MemoryItem"("sourceCandidateId");

-- CreateIndex
CREATE INDEX "MemoryItem_supersedesMemoryId_idx" ON "MemoryItem"("supersedesMemoryId");

-- CreateIndex
CREATE INDEX "MemoryItem_deletedAt_idx" ON "MemoryItem"("deletedAt");

-- CreateIndex
CREATE INDEX "MemoryCandidate_organizationId_idx" ON "MemoryCandidate"("organizationId");

-- CreateIndex
CREATE INDEX "MemoryCandidate_organizationId_status_idx" ON "MemoryCandidate"("organizationId", "status");

-- CreateIndex
CREATE INDEX "MemoryCandidate_organizationId_proposedType_idx" ON "MemoryCandidate"("organizationId", "proposedType");

-- CreateIndex
CREATE INDEX "MemoryCandidate_organizationId_subjectType_subjectId_idx" ON "MemoryCandidate"("organizationId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "MemoryCandidate_organizationId_proposedKey_idx" ON "MemoryCandidate"("organizationId", "proposedKey");

-- CreateIndex
CREATE INDEX "MemoryCandidate_reviewedAt_idx" ON "MemoryCandidate"("reviewedAt");

-- AddForeignKey
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_sourceCandidateId_fkey" FOREIGN KEY ("sourceCandidateId") REFERENCES "MemoryCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_supersedesMemoryId_fkey" FOREIGN KEY ("supersedesMemoryId") REFERENCES "MemoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryCandidate" ADD CONSTRAINT "MemoryCandidate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryCandidate" ADD CONSTRAINT "MemoryCandidate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryCandidate" ADD CONSTRAINT "MemoryCandidate_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryCandidate" ADD CONSTRAINT "MemoryCandidate_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
