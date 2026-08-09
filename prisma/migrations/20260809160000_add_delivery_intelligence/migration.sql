-- CreateEnum
CREATE TYPE "DeliveryItemCondition" AS ENUM ('OK', 'SHORT', 'DAMAGED', 'WRONG_ITEM', 'MIXED');

-- CreateEnum
CREATE TYPE "DeliveryExceptionCategory" AS ENUM ('CUSTOMER_NOT_AT_ADDRESS', 'DELIVERY_REFUSED', 'PRODUCT_DAMAGED', 'VEHICLE_BREAKDOWN', 'WRONG_ADDRESS', 'SHORTAGE_FOUND', 'DELIVERY_POSTPONED', 'OTHER');

-- AlterTable
ALTER TABLE "DeliveryItem" ADD COLUMN "conditionFlag" "DeliveryItemCondition";

-- CreateTable
CREATE TABLE "DeliveryException" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "category" "DeliveryExceptionCategory" NOT NULL,
    "note" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryException_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeliveryException_organizationId_deliveryId_idx" ON "DeliveryException"("organizationId", "deliveryId");
CREATE INDEX "DeliveryException_deliveryId_createdAt_idx" ON "DeliveryException"("deliveryId", "createdAt");

ALTER TABLE "DeliveryException" ADD CONSTRAINT "DeliveryException_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryException" ADD CONSTRAINT "DeliveryException_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
