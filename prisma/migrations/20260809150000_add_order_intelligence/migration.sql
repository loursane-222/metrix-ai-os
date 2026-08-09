-- CreateEnum
CREATE TYPE "OrderRevisionChangeType" AS ENUM ('QUANTITY_CHANGED', 'DEADLINE_CHANGED', 'ITEM_ADDED', 'ITEM_REMOVED');

-- CreateEnum
CREATE TYPE "OrderExceptionCategory" AS ENUM ('CUSTOMER_HOLD_REQUEST', 'PRODUCTION_STOPPED', 'QUALITY_ISSUE', 'SUPPLY_DELAY', 'PAYMENT_HOLD', 'SHIPMENT_DELAYED', 'CUSTOMER_ADDRESS_CHANGED', 'OTHER');

-- CreateTable
CREATE TABLE "OrderRevision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "changeType" "OrderRevisionChangeType" NOT NULL,
    "beforeSnapshot" JSONB NOT NULL,
    "afterSnapshot" JSONB NOT NULL,
    "reason" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderException" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "category" "OrderExceptionCategory" NOT NULL,
    "note" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderException_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OrderItem" ADD COLUMN "removedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "OrderRevision_orderId_revisionNumber_key" ON "OrderRevision"("orderId", "revisionNumber");
CREATE INDEX "OrderRevision_organizationId_orderId_idx" ON "OrderRevision"("organizationId", "orderId");
CREATE INDEX "OrderRevision_orderId_createdAt_idx" ON "OrderRevision"("orderId", "createdAt");
CREATE INDEX "OrderException_organizationId_orderId_idx" ON "OrderException"("organizationId", "orderId");
CREATE INDEX "OrderException_orderId_createdAt_idx" ON "OrderException"("orderId", "createdAt");

ALTER TABLE "OrderRevision" ADD CONSTRAINT "OrderRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderRevision" ADD CONSTRAINT "OrderRevision_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderException" ADD CONSTRAINT "OrderException_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderException" ADD CONSTRAINT "OrderException_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
