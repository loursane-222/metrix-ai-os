-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('NO_VARIANCE', 'PENDING_INVESTIGATION', 'CORRECTED', 'DISMISSED');

-- AlterTable
ALTER TABLE "ProductService"
ADD COLUMN "minStockLevel" DECIMAL(14,3),
ADD COLUMN "maxStockLevel" DECIMAL(14,3);

-- AlterTable
ALTER TABLE "Stock" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StockCountRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "systemQuantityAtCount" DECIMAL(14,3) NOT NULL,
    "countedQuantity" DECIMAL(14,3) NOT NULL,
    "varianceQuantity" DECIMAL(14,3) NOT NULL,
    "status" "StockCountStatus" NOT NULL,
    "investigationNote" TEXT,
    "performedById" TEXT,
    "correctionMovementId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCountRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockCountRecord_organizationId_status_idx" ON "StockCountRecord"("organizationId", "status");
CREATE INDEX "StockCountRecord_organizationId_stockId_createdAt_idx" ON "StockCountRecord"("organizationId", "stockId", "createdAt");
CREATE INDEX "StockCountRecord_correctionMovementId_idx" ON "StockCountRecord"("correctionMovementId");

-- AddForeignKey
ALTER TABLE "StockCountRecord" ADD CONSTRAINT "StockCountRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockCountRecord" ADD CONSTRAINT "StockCountRecord_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
