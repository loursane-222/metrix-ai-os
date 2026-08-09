-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('PLANNED', 'INCOMING', 'RECEIVING', 'QUALITY_CONTROL', 'AVAILABLE', 'RESERVED', 'ALLOCATED', 'PICKING', 'PACKED', 'IN_TRANSIT', 'DELIVERED', 'RETURNED', 'QUARANTINE', 'DAMAGED', 'SCRAPPED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('RECEIPT', 'TRANSFER_OUT', 'TRANSFER_IN', 'RESERVE', 'RELEASE_RESERVATION', 'CONSUME', 'RETURN', 'ADJUSTMENT', 'SCRAP');

-- CreateEnum
CREATE TYPE "MovementSourceType" AS ENUM ('ORDER', 'DELIVERY', 'MANUAL', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stock" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productServiceId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "location" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reservedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "status" "StockStatus" NOT NULL DEFAULT 'AVAILABLE',
    "lot" TEXT,
    "batch" TEXT,
    "serialNumber" TEXT,
    "dynamicAttributes" JSONB,
    "executiveSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "movementType" "MovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "fromWarehouseId" TEXT,
    "toWarehouseId" TEXT,
    "fromStatus" "StockStatus",
    "toStatus" "StockStatus",
    "sourceType" "MovementSourceType" NOT NULL,
    "sourceId" TEXT,
    "reason" TEXT,
    "performedById" TEXT,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCustomFieldValue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,

    CONSTRAINT "StockCustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_organizationId_code_key" ON "Warehouse"("organizationId", "code");
CREATE INDEX "Warehouse_organizationId_idx" ON "Warehouse"("organizationId");

CREATE INDEX "Stock_organizationId_idx" ON "Stock"("organizationId");
CREATE INDEX "Stock_organizationId_productServiceId_idx" ON "Stock"("organizationId", "productServiceId");
CREATE INDEX "Stock_organizationId_warehouseId_idx" ON "Stock"("organizationId", "warehouseId");
CREATE INDEX "Stock_organizationId_status_idx" ON "Stock"("organizationId", "status");
CREATE INDEX "Stock_productServiceId_status_idx" ON "Stock"("productServiceId", "status");

CREATE INDEX "StockMovement_organizationId_idx" ON "StockMovement"("organizationId");
CREATE INDEX "StockMovement_stockId_createdAt_idx" ON "StockMovement"("stockId", "createdAt");
CREATE INDEX "StockMovement_sourceType_sourceId_idx" ON "StockMovement"("sourceType", "sourceId");
CREATE INDEX "StockMovement_organizationId_movementType_idx" ON "StockMovement"("organizationId", "movementType");

CREATE UNIQUE INDEX "StockCustomFieldValue_stockId_definitionId_key" ON "StockCustomFieldValue"("stockId", "definitionId");
CREATE INDEX "StockCustomFieldValue_organizationId_stockId_idx" ON "StockCustomFieldValue"("organizationId", "stockId");
CREATE INDEX "StockCustomFieldValue_organizationId_definitionId_idx" ON "StockCustomFieldValue"("organizationId", "definitionId");

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Stock" ADD CONSTRAINT "Stock_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_productServiceId_fkey" FOREIGN KEY ("productServiceId") REFERENCES "ProductService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Stock" ADD CONSTRAINT "Stock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockCustomFieldValue" ADD CONSTRAINT "StockCustomFieldValue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockCustomFieldValue" ADD CONSTRAINT "StockCustomFieldValue_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockCustomFieldValue" ADD CONSTRAINT "StockCustomFieldValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CustomFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
