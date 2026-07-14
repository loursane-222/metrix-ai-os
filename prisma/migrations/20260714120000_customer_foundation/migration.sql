-- Customer Foundation (Faz 1)
-- Additive only. Does not drop or rename any existing column, table, or enum value.
-- personId on Quote/Payment/CollectionAction is left untouched — this migration only adds
-- parallel, nullable customerId columns so the AI/reporting chain that reads personId today
-- keeps working unchanged while the canonical Customer identity is introduced.

-- CreateEnum
CREATE TYPE "CustomerContactSource" AS ENUM ('MANUAL', 'METRIX_INFERRED', 'MIGRATED_FROM_PERSON');

-- AlterTable: Customer — Müşteriler Anayasası madde 4 sabit alanları + sistem alanları
ALTER TABLE "Customer"
  ADD COLUMN "cariKodu" TEXT,
  ADD COLUMN "taxNumber" TEXT,
  ADD COLUMN "taxOffice" TEXT,
  ADD COLUMN "mersisNo" TEXT,
  ADD COLUMN "tradeRegistryNo" TEXT,
  ADD COLUMN "billingAddress" JSONB,
  ADD COLUMN "shippingAddress" JSONB,
  ADD COLUMN "eInvoiceEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "eArchiveEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "updatedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "Customer_organizationId_cariKodu_idx" ON "Customer"("organizationId", "cariKodu");

-- CreateIndex
CREATE INDEX "Customer_organizationId_taxNumber_idx" ON "Customer"("organizationId", "taxNumber");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: CustomerContact — Customer 1—N CustomerContact N—1 Person
CREATE TABLE "CustomerContact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "personId" TEXT,
    "fullName" TEXT,
    "title" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "source" "CustomerContactSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerContact_organizationId_customerId_idx" ON "CustomerContact"("organizationId", "customerId");

-- CreateIndex
CREATE INDEX "CustomerContact_organizationId_customerId_isPrimary_idx" ON "CustomerContact"("organizationId", "customerId", "isPrimary");

-- CreateIndex
CREATE INDEX "CustomerContact_personId_idx" ON "CustomerContact"("personId");

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Quote — parallel customerId, personId untouched
ALTER TABLE "Quote" ADD COLUMN "customerId" TEXT;

-- CreateIndex
CREATE INDEX "Quote_organizationId_customerId_idx" ON "Quote"("organizationId", "customerId");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: Payment — parallel customerId, personId untouched
ALTER TABLE "Payment" ADD COLUMN "customerId" TEXT;

-- CreateIndex
CREATE INDEX "Payment_organizationId_customerId_idx" ON "Payment"("organizationId", "customerId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: CollectionAction — parallel customerId (denormalized from Payment for direct queries)
ALTER TABLE "CollectionAction" ADD COLUMN "customerId" TEXT;

-- CreateIndex
CREATE INDEX "CollectionAction_organizationId_customerId_idx" ON "CollectionAction"("organizationId", "customerId");

-- AddForeignKey
ALTER TABLE "CollectionAction" ADD CONSTRAINT "CollectionAction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
