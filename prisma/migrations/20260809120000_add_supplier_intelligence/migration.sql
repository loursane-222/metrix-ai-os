ALTER TYPE "MovementSourceType" ADD VALUE 'SUPPLIER';

ALTER TABLE "Supplier" ADD COLUMN "riskNotes" TEXT;

ALTER TABLE "StockMovement"
ADD COLUMN "supplierId" TEXT,
ADD COLUMN "expectedAt" TIMESTAMP(3),
ADD COLUMN "unitCostCents" BIGINT,
ADD COLUMN "qualityFlag" TEXT;

ALTER TABLE "StockMovement"
ADD CONSTRAINT "StockMovement_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "StockMovement_organizationId_supplierId_movementType_idx"
ON "StockMovement"("organizationId", "supplierId", "movementType");
