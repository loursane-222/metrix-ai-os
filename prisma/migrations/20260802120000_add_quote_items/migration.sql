-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "customerNote" TEXT,
ADD COLUMN     "deliveryMethod" TEXT,
ADD COLUMN     "deliveryTerm" TEXT,
ADD COLUMN     "generalDiscountBasisPoints" INTEGER,
ADD COLUMN     "paymentTerm" TEXT,
ADD COLUMN     "validUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "QuoteItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
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

    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuoteItem_organizationId_idx" ON "QuoteItem"("organizationId");

-- CreateIndex
CREATE INDEX "QuoteItem_quoteId_idx" ON "QuoteItem"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteItem_quoteId_sortOrder_idx" ON "QuoteItem"("quoteId", "sortOrder");

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_productServiceId_fkey" FOREIGN KEY ("productServiceId") REFERENCES "ProductService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
