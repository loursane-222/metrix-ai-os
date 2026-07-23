-- CreateEnum
CREATE TYPE "ExecutiveActionSourceType" AS ENUM ('EXECUTIVE_PRIORITY', 'DAILY_BRIEFING', 'MANAGEMENT_REVIEW', 'PERFORMANCE_SIGNAL', 'CUSTOMER_SIGNAL', 'DECISION', 'MANUAL');

-- CreateEnum
CREATE TYPE "ExecutiveActionPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ExecutiveActionOwnerType" AS ENUM ('USER', 'PERSON', 'METRIX', 'UNASSIGNED');

-- CreateEnum
CREATE TYPE "ExecutiveActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExecutiveActionOutcomeStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "ExecutiveAction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceType" "ExecutiveActionSourceType" NOT NULL,
    "sourceId" TEXT,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "priority" "ExecutiveActionPriority" NOT NULL DEFAULT 'MEDIUM',
    "ownerType" "ExecutiveActionOwnerType" NOT NULL DEFAULT 'UNASSIGNED',
    "ownerId" TEXT,
    "status" "ExecutiveActionStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "resultSummary" TEXT,
    "outcomeStatus" "ExecutiveActionOutcomeStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutiveAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExecutiveAction_organizationId_idx" ON "ExecutiveAction"("organizationId");

-- CreateIndex
CREATE INDEX "ExecutiveAction_organizationId_status_idx" ON "ExecutiveAction"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ExecutiveAction_organizationId_sourceType_sourceId_idx" ON "ExecutiveAction"("organizationId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "ExecutiveAction_status_idx" ON "ExecutiveAction"("status");

-- CreateIndex
CREATE INDEX "ExecutiveAction_dueDate_idx" ON "ExecutiveAction"("dueDate");

-- AddForeignKey
ALTER TABLE "ExecutiveAction" ADD CONSTRAINT "ExecutiveAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
