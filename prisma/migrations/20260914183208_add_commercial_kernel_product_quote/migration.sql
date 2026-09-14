-- CreateEnum
CREATE TYPE "ProductServiceType" AS ENUM ('PRODUCT', 'SERVICE');

-- CreateEnum
CREATE TYPE "ProductServiceStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT');

-- CreateTable
CREATE TABLE "ProductService" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProductServiceType" NOT NULL,
    "category" TEXT,
    "unit" TEXT,
    "costCents" BIGINT,
    "priceCents" BIGINT,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "status" "ProductServiceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "customerNote" TEXT,
    "specialTerms" TEXT,
    "validUntil" TIMESTAMP(3),
    "generalDiscountBasisPoints" INTEGER,
    "deliveryTerm" TEXT,
    "deliveryMethod" TEXT,
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

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
CREATE INDEX "ProductService_organizationId_status_idx" ON "ProductService"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ProductService_organizationId_name_idx" ON "ProductService"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Quote_organizationId_status_idx" ON "Quote"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Quote_organizationId_customerId_idx" ON "Quote"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX "QuoteItem_organizationId_idx" ON "QuoteItem"("organizationId");

-- CreateIndex
CREATE INDEX "QuoteItem_quoteId_sortOrder_idx" ON "QuoteItem"("quoteId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ProductService" ADD CONSTRAINT "ProductService_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_productServiceId_fkey" FOREIGN KEY ("productServiceId") REFERENCES "ProductService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
