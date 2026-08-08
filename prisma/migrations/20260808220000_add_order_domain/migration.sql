-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PLANNED', 'IN_PRODUCTION', 'READY', 'PARTIALLY_SHIPPED', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'ON_HOLD');

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sourceQuoteId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "deadlineAt" TIMESTAMP(3),
    "commitmentAt" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "notes" TEXT,
    "cancellationReason" TEXT,
    "reservedInventory" JSONB,
    "productionRequirement" JSONB,
    "deliverySchedule" JSONB,
    "executiveAssessment" JSONB,
    "riskSignals" JSONB,
    "executiveSummary" JSONB,
    "dynamicAttributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productServiceId" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPriceCents" BIGINT NOT NULL,
    "lineTotalCents" BIGINT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "reason" TEXT,
    "performedById" TEXT,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderCustomFieldValue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    CONSTRAINT "OrderCustomFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_organizationId_orderNumber_key" ON "Order"("organizationId", "orderNumber");
CREATE INDEX "Order_organizationId_status_idx" ON "Order"("organizationId", "status");
CREATE INDEX "Order_organizationId_customerId_idx" ON "Order"("organizationId", "customerId");
CREATE INDEX "Order_organizationId_sourceQuoteId_idx" ON "Order"("organizationId", "sourceQuoteId");
CREATE INDEX "Order_organizationId_deadlineAt_idx" ON "Order"("organizationId", "deadlineAt");
CREATE INDEX "OrderItem_organizationId_idx" ON "OrderItem"("organizationId");
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_orderId_sortOrder_idx" ON "OrderItem"("orderId", "sortOrder");
CREATE INDEX "OrderStatusHistory_organizationId_orderId_idx" ON "OrderStatusHistory"("organizationId", "orderId");
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");
CREATE UNIQUE INDEX "OrderCustomFieldValue_orderId_definitionId_key" ON "OrderCustomFieldValue"("orderId", "definitionId");
CREATE INDEX "OrderCustomFieldValue_organizationId_orderId_idx" ON "OrderCustomFieldValue"("organizationId", "orderId");
CREATE INDEX "OrderCustomFieldValue_organizationId_definitionId_idx" ON "OrderCustomFieldValue"("organizationId", "definitionId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_sourceQuoteId_fkey" FOREIGN KEY ("sourceQuoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productServiceId_fkey" FOREIGN KEY ("productServiceId") REFERENCES "ProductService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderCustomFieldValue" ADD CONSTRAINT "OrderCustomFieldValue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderCustomFieldValue" ADD CONSTRAINT "OrderCustomFieldValue_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderCustomFieldValue" ADD CONSTRAINT "OrderCustomFieldValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CustomFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
