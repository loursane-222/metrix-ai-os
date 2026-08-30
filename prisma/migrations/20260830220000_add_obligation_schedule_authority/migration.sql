-- CreateEnum
CREATE TYPE "ObligationDirection" AS ENUM ('RECEIVABLE', 'PAYABLE');
CREATE TYPE "ObligationSourceType" AS ENUM ('INVOICE', 'EXPENSE');
CREATE TYPE "PaymentTermAllocationType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'REMAINDER');
CREATE TYPE "PaymentTermMaturityBasis" AS ENUM ('IMMEDIATE', 'DAYS_AFTER_REFERENCE', 'FIXED_DATE');
CREATE TYPE "PaymentTermReferenceDateType" AS ENUM ('QUOTE_DATE', 'ORDER_DATE', 'INVOICE_DATE', 'DELIVERY_DATE');

-- CreateTable
CREATE TABLE "ObligationScheduleLine" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "direction" "ObligationDirection" NOT NULL,
    "sourceType" "ObligationSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "componentIndex" INTEGER NOT NULL,
    "allocationType" "PaymentTermAllocationType" NOT NULL,
    "maturityBasis" "PaymentTermMaturityBasis" NOT NULL,
    "referenceDateType" "PaymentTermReferenceDateType",
    "dueDate" TIMESTAMP(3) NOT NULL,
    "originalAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentId" TEXT,
    "expenseId" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ObligationScheduleLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ObligationScheduleLine_paymentId_key" ON "ObligationScheduleLine"("paymentId");
CREATE UNIQUE INDEX "ObligationScheduleLine_expenseId_key" ON "ObligationScheduleLine"("expenseId");
CREATE UNIQUE INDEX "ObligationScheduleLine_organizationId_sourceType_sourceId_componentIndex_key" ON "ObligationScheduleLine"("organizationId", "sourceType", "sourceId", "componentIndex");
CREATE INDEX "ObligationScheduleLine_organizationId_direction_dueDate_idx" ON "ObligationScheduleLine"("organizationId", "direction", "dueDate");
CREATE INDEX "ObligationScheduleLine_organizationId_sourceType_sourceId_idx" ON "ObligationScheduleLine"("organizationId", "sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "ObligationScheduleLine" ADD CONSTRAINT "ObligationScheduleLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ObligationScheduleLine" ADD CONSTRAINT "ObligationScheduleLine_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ObligationScheduleLine" ADD CONSTRAINT "ObligationScheduleLine_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
