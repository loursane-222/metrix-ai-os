-- CreateEnum
CREATE TYPE "OrchestrationStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED');
CREATE TYPE "OrchestrationStepStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');
CREATE TYPE "CommunicationType" AS ENUM ('PAYMENT_REMINDER');
CREATE TYPE "CommunicationAudienceType" AS ENUM ('CUSTOMER');
CREATE TYPE "CommunicationTone" AS ENUM ('FRIENDLY', 'FORMAL', 'DIRECT');
CREATE TYPE "CommunicationChannel" AS ENUM ('EMAIL');
CREATE TYPE "CommunicationStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "ExecutiveOrchestration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "triggerUtterance" TEXT NOT NULL,
    "triggerUserId" TEXT,
    "status" "OrchestrationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ExecutiveOrchestration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrchestrationStep" (
    "id" TEXT NOT NULL,
    "orchestrationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "domain" TEXT NOT NULL,
    "actionName" TEXT NOT NULL,
    "status" "OrchestrationStepStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB,
    "resultEntityType" TEXT,
    "resultEntityId" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "OrchestrationStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutiveCommunication" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "communicationType" "CommunicationType" NOT NULL,
    "audienceType" "CommunicationAudienceType" NOT NULL,
    "customerId" TEXT,
    "channel" "CommunicationChannel" NOT NULL DEFAULT 'EMAIL',
    "toneStrategy" "CommunicationTone" NOT NULL DEFAULT 'FRIENDLY',
    "objective" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "status" "CommunicationStatus" NOT NULL,
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "evidenceRefs" JSONB,
    "triggerUserId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutiveCommunication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExecutiveOrchestration_organizationId_status_idx" ON "ExecutiveOrchestration"("organizationId", "status");
CREATE INDEX "ExecutiveOrchestration_organizationId_createdAt_idx" ON "ExecutiveOrchestration"("organizationId", "createdAt");

CREATE INDEX "OrchestrationStep_orchestrationId_sequence_idx" ON "OrchestrationStep"("orchestrationId", "sequence");
CREATE INDEX "OrchestrationStep_organizationId_idx" ON "OrchestrationStep"("organizationId");

CREATE INDEX "ExecutiveCommunication_organizationId_communicationType_idx" ON "ExecutiveCommunication"("organizationId", "communicationType");
CREATE INDEX "ExecutiveCommunication_organizationId_customerId_idx" ON "ExecutiveCommunication"("organizationId", "customerId");

-- AddForeignKey
ALTER TABLE "ExecutiveOrchestration" ADD CONSTRAINT "ExecutiveOrchestration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrchestrationStep" ADD CONSTRAINT "OrchestrationStep_orchestrationId_fkey" FOREIGN KEY ("orchestrationId") REFERENCES "ExecutiveOrchestration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExecutiveCommunication" ADD CONSTRAINT "ExecutiveCommunication_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExecutiveCommunication" ADD CONSTRAINT "ExecutiveCommunication_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
