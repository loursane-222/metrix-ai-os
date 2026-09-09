-- Stage 2 (Executive Awareness / Always-On Watch): additive-only.
-- Adds a proactive-delivery preference to OrganizationMember and a new
-- restart-safe lifecycle table for background Executive judgment. No
-- existing table, column, or constraint is touched.

-- AlterTable
ALTER TABLE "OrganizationMember"
ADD COLUMN     "awarenessMuteAll" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "awarenessMutedCategories" JSONB;

-- CreateTable
CREATE TABLE "ExecutiveAwarenessInsight" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "correlationTitle" TEXT NOT NULL,
    "disposition" TEXT NOT NULL,
    "significance" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "category" TEXT,
    "urgency" TEXT,
    "reason" TEXT NOT NULL,
    "insightText" TEXT NOT NULL,
    "recommendedNextMove" TEXT,
    "evidenceFingerprints" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "lastDeliveredAt" TIMESTAMP(3),
    "lastDeliveredSignificance" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutiveAwarenessInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExecutiveAwarenessInsight_organizationId_fingerprint_key" ON "ExecutiveAwarenessInsight"("organizationId", "fingerprint");

-- CreateIndex
CREATE INDEX "ExecutiveAwarenessInsight_organizationId_status_idx" ON "ExecutiveAwarenessInsight"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ExecutiveAwarenessInsight_organizationId_lastSeenAt_idx" ON "ExecutiveAwarenessInsight"("organizationId", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "ExecutiveAwarenessInsight" ADD CONSTRAINT "ExecutiveAwarenessInsight_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
