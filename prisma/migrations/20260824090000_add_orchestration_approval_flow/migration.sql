-- AlterEnum
ALTER TYPE "OrchestrationStatus" ADD VALUE 'AWAITING_APPROVAL';
ALTER TYPE "OrchestrationStepStatus" ADD VALUE 'AWAITING_APPROVAL';

-- AlterTable
ALTER TABLE "OrchestrationStep" ADD COLUMN "approvalRequestId" TEXT;
