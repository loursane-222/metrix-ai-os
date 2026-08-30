-- CreateEnum
CREATE TYPE "InstrumentType" AS ENUM ('CHEQUE', 'PROMISSORY_NOTE');

-- CreateEnum
CREATE TYPE "InstrumentDirection" AS ENUM ('RECEIVED', 'ISSUED');

-- CreateEnum
CREATE TYPE "InstrumentStatus" AS ENUM ('REGISTERED', 'ALLOCATED', 'CLEARED', 'BOUNCED', 'CANCELLED');

-- CreateTable
CREATE TABLE "FinancialInstrument" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "instrumentType" "InstrumentType" NOT NULL,
    "direction" "InstrumentDirection" NOT NULL,
    "customerId" TEXT,
    "supplierId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3),
    "maturityDate" TIMESTAMP(3) NOT NULL,
    "instrumentNumber" TEXT,
    "bankName" TEXT,
    "branchName" TEXT,
    "drawerName" TEXT,
    "status" "InstrumentStatus" NOT NULL DEFAULT 'REGISTERED',
    "cancelReason" TEXT,
    "notes" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialInstrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstrumentStatusHistory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "fromStatus" "InstrumentStatus",
    "toStatus" "InstrumentStatus" NOT NULL,
    "reason" TEXT,
    "performedById" TEXT,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstrumentStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstrumentAllocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "obligationScheduleLineId" TEXT NOT NULL,
    "kind" "SettlementKind" NOT NULL DEFAULT 'ORIGINAL',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL,
    "settledReferenceType" TEXT,
    "settledReferenceId" TEXT,
    "reversalOfId" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstrumentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialInstrument_organizationId_direction_status_idx" ON "FinancialInstrument"("organizationId", "direction", "status");
CREATE INDEX "FinancialInstrument_organizationId_maturityDate_idx" ON "FinancialInstrument"("organizationId", "maturityDate");
CREATE INDEX "FinancialInstrument_organizationId_customerId_idx" ON "FinancialInstrument"("organizationId", "customerId");
CREATE INDEX "FinancialInstrument_organizationId_supplierId_idx" ON "FinancialInstrument"("organizationId", "supplierId");

-- CreateIndex
CREATE INDEX "InstrumentStatusHistory_organizationId_instrumentId_idx" ON "InstrumentStatusHistory"("organizationId", "instrumentId");

-- CreateIndex
CREATE UNIQUE INDEX "InstrumentAllocation_reversalOfId_key" ON "InstrumentAllocation"("reversalOfId");
CREATE INDEX "InstrumentAllocation_organizationId_instrumentId_idx" ON "InstrumentAllocation"("organizationId", "instrumentId");
CREATE INDEX "InstrumentAllocation_organizationId_obligationScheduleLineId_idx" ON "InstrumentAllocation"("organizationId", "obligationScheduleLineId");

-- AddForeignKey
ALTER TABLE "FinancialInstrument" ADD CONSTRAINT "FinancialInstrument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialInstrument" ADD CONSTRAINT "FinancialInstrument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialInstrument" ADD CONSTRAINT "FinancialInstrument_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstrumentStatusHistory" ADD CONSTRAINT "InstrumentStatusHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstrumentStatusHistory" ADD CONSTRAINT "InstrumentStatusHistory_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "FinancialInstrument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstrumentAllocation" ADD CONSTRAINT "InstrumentAllocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstrumentAllocation" ADD CONSTRAINT "InstrumentAllocation_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "FinancialInstrument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstrumentAllocation" ADD CONSTRAINT "InstrumentAllocation_obligationScheduleLineId_fkey" FOREIGN KEY ("obligationScheduleLineId") REFERENCES "ObligationScheduleLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstrumentAllocation" ADD CONSTRAINT "InstrumentAllocation_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "InstrumentAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
