-- CreateEnum
CREATE TYPE "ProductionOrderStatus" AS ENUM ('DRAFT', 'PLANNED', 'RELEASED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkCenterStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MachineStatus" AS ENUM ('RUNNING', 'IDLE', 'MAINTENANCE', 'BROKEN');

-- CreateTable
CREATE TABLE "WorkCenter" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "WorkCenterStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workCenterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "MachineStatus" NOT NULL DEFAULT 'IDLE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceOrderId" TEXT,
    "productServiceId" TEXT,
    "workCenterId" TEXT,
    "quantityPlanned" DECIMAL(14,3) NOT NULL,
    "quantityProduced" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "plannedStartAt" TIMESTAMP(3),
    "plannedEndAt" TIMESTAMP(3),
    "actualStartAt" TIMESTAMP(3),
    "actualEndAt" TIMESTAMP(3),
    "notes" TEXT,
    "executiveSummary" JSONB,
    "riskSignals" JSONB,
    "dynamicAttributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrderStatusHistory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "fromStatus" "ProductionOrderStatus",
    "toStatus" "ProductionOrderStatus" NOT NULL,
    "reason" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionOrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrderCustomFieldValue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,

    CONSTRAINT "ProductionOrderCustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkCenter_organizationId_status_idx" ON "WorkCenter"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkCenter_organizationId_code_key" ON "WorkCenter"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Machine_organizationId_workCenterId_idx" ON "Machine"("organizationId", "workCenterId");

-- CreateIndex
CREATE INDEX "Machine_organizationId_status_idx" ON "Machine"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_organizationId_code_key" ON "Machine"("organizationId", "code");

-- CreateIndex
CREATE INDEX "ProductionOrder_organizationId_status_idx" ON "ProductionOrder"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ProductionOrder_organizationId_sourceOrderId_idx" ON "ProductionOrder"("organizationId", "sourceOrderId");

-- CreateIndex
CREATE INDEX "ProductionOrder_organizationId_workCenterId_idx" ON "ProductionOrder"("organizationId", "workCenterId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_organizationId_orderNumber_key" ON "ProductionOrder"("organizationId", "orderNumber");

-- CreateIndex
CREATE INDEX "ProductionOrderStatusHistory_organizationId_productionOrder_idx" ON "ProductionOrderStatusHistory"("organizationId", "productionOrderId");

-- CreateIndex
CREATE INDEX "ProductionOrderStatusHistory_productionOrderId_createdAt_idx" ON "ProductionOrderStatusHistory"("productionOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductionOrderCustomFieldValue_organizationId_productionOr_idx" ON "ProductionOrderCustomFieldValue"("organizationId", "productionOrderId");

-- CreateIndex
CREATE INDEX "ProductionOrderCustomFieldValue_organizationId_definitionId_idx" ON "ProductionOrderCustomFieldValue"("organizationId", "definitionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrderCustomFieldValue_productionOrderId_definitio_key" ON "ProductionOrderCustomFieldValue"("productionOrderId", "definitionId");

-- AddForeignKey
ALTER TABLE "WorkCenter" ADD CONSTRAINT "WorkCenter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_productServiceId_fkey" FOREIGN KEY ("productServiceId") REFERENCES "ProductService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderStatusHistory" ADD CONSTRAINT "ProductionOrderStatusHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderStatusHistory" ADD CONSTRAINT "ProductionOrderStatusHistory_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderCustomFieldValue" ADD CONSTRAINT "ProductionOrderCustomFieldValue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderCustomFieldValue" ADD CONSTRAINT "ProductionOrderCustomFieldValue_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderCustomFieldValue" ADD CONSTRAINT "ProductionOrderCustomFieldValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CustomFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

