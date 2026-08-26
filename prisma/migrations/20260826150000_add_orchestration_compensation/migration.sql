-- CreateEnum
CREATE TYPE "WarehouseStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "MachineStatus" ADD VALUE 'RETIRED';

-- AlterEnum
ALTER TYPE "OrchestrationStatus" ADD VALUE 'COMPENSATING';
ALTER TYPE "OrchestrationStatus" ADD VALUE 'COMPENSATED';
ALTER TYPE "OrchestrationStatus" ADD VALUE 'COMPENSATION_FAILED';

-- AlterEnum
ALTER TYPE "OrchestrationStepStatus" ADD VALUE 'COMPENSATING';
ALTER TYPE "OrchestrationStepStatus" ADD VALUE 'COMPENSATED';
ALTER TYPE "OrchestrationStepStatus" ADD VALUE 'COMPENSATION_FAILED';
ALTER TYPE "OrchestrationStepStatus" ADD VALUE 'COMPENSATION_AWAITING_APPROVAL';

-- AlterTable
ALTER TABLE "OrchestrationStep" ADD COLUMN     "compensatedAt" TIMESTAMP(3),
ADD COLUMN     "compensationSnapshot" JSONB;

-- AlterTable
ALTER TABLE "Warehouse" ADD COLUMN     "status" "WarehouseStatus" NOT NULL DEFAULT 'ACTIVE';
