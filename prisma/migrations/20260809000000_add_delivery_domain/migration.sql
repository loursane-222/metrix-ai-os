-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('DRAFT', 'PREPARING', 'PICKING', 'PACKING', 'LOADED', 'DISPATCHED', 'AT_DELIVERY_POINT', 'DELIVERED', 'COMPLETED', 'FAILED_DELIVERY', 'RESCHEDULED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deliveryNumber" TEXT NOT NULL,
    "sourceOrderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'DRAFT',
    "warehouse" TEXT,
    "dispatchPoint" TEXT,
    "deliveryAddress" TEXT,
    "carrier" TEXT,
    "vehicleInfo" TEXT,
    "trackingInfo" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "receiverName" TEXT,
    "deliveryProof" JSONB,
    "notes" TEXT,
    "cancellationReason" TEXT,
    "returnRelations" JSONB,
    "executiveAssessment" JSONB,
    "riskSignals" JSONB,
    "executiveSummary" JSONB,
    "dynamicAttributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "productServiceId" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryStatusHistory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "fromStatus" "DeliveryStatus",
    "toStatus" "DeliveryStatus" NOT NULL,
    "reason" TEXT,
    "performedById" TEXT,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryCustomFieldValue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,

    CONSTRAINT "DeliveryCustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_organizationId_deliveryNumber_key" ON "Delivery"("organizationId", "deliveryNumber");
CREATE INDEX "Delivery_organizationId_status_idx" ON "Delivery"("organizationId", "status");
CREATE INDEX "Delivery_organizationId_customerId_idx" ON "Delivery"("organizationId", "customerId");
CREATE INDEX "Delivery_organizationId_sourceOrderId_idx" ON "Delivery"("organizationId", "sourceOrderId");

CREATE INDEX "DeliveryItem_organizationId_idx" ON "DeliveryItem"("organizationId");
CREATE INDEX "DeliveryItem_deliveryId_idx" ON "DeliveryItem"("deliveryId");
CREATE INDEX "DeliveryItem_deliveryId_sortOrder_idx" ON "DeliveryItem"("deliveryId", "sortOrder");
CREATE INDEX "DeliveryItem_orderItemId_idx" ON "DeliveryItem"("orderItemId");

CREATE INDEX "DeliveryStatusHistory_organizationId_deliveryId_idx" ON "DeliveryStatusHistory"("organizationId", "deliveryId");
CREATE INDEX "DeliveryStatusHistory_deliveryId_createdAt_idx" ON "DeliveryStatusHistory"("deliveryId", "createdAt");

CREATE UNIQUE INDEX "DeliveryCustomFieldValue_deliveryId_definitionId_key" ON "DeliveryCustomFieldValue"("deliveryId", "definitionId");
CREATE INDEX "DeliveryCustomFieldValue_organizationId_deliveryId_idx" ON "DeliveryCustomFieldValue"("organizationId", "deliveryId");
CREATE INDEX "DeliveryCustomFieldValue_organizationId_definitionId_idx" ON "DeliveryCustomFieldValue"("organizationId", "definitionId");

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DeliveryItem" ADD CONSTRAINT "DeliveryItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryItem" ADD CONSTRAINT "DeliveryItem_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryItem" ADD CONSTRAINT "DeliveryItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryItem" ADD CONSTRAINT "DeliveryItem_productServiceId_fkey" FOREIGN KEY ("productServiceId") REFERENCES "ProductService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeliveryStatusHistory" ADD CONSTRAINT "DeliveryStatusHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryStatusHistory" ADD CONSTRAINT "DeliveryStatusHistory_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeliveryCustomFieldValue" ADD CONSTRAINT "DeliveryCustomFieldValue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryCustomFieldValue" ADD CONSTRAINT "DeliveryCustomFieldValue_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryCustomFieldValue" ADD CONSTRAINT "DeliveryCustomFieldValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CustomFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
