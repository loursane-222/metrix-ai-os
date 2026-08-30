-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "deliveryId" TEXT;

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "productServiceId" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPriceCents" BIGINT NOT NULL,
    "discountBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "vatRateBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "lineTotalCents" BIGINT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceItem_organizationId_idx" ON "InvoiceItem"("organizationId");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_sortOrder_idx" ON "InvoiceItem"("invoiceId", "sortOrder");

-- CreateIndex
CREATE INDEX "InvoiceItem_orderItemId_idx" ON "InvoiceItem"("orderItemId");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_orderId_idx" ON "Invoice"("organizationId", "orderId");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_deliveryId_idx" ON "Invoice"("organizationId", "deliveryId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_productServiceId_fkey" FOREIGN KEY ("productServiceId") REFERENCES "ProductService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
