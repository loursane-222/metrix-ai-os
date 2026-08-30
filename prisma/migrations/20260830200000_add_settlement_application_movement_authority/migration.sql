-- AlterEnum
ALTER TYPE "LedgerSourceType" ADD VALUE 'PAYMENT_APPLICATION';

-- CreateEnum
CREATE TYPE "MoneyDirection" AS ENUM ('IN', 'OUT');
CREATE TYPE "SettlementKind" AS ENUM ('ORIGINAL', 'REVERSAL');

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "kind" "SettlementKind" NOT NULL DEFAULT 'ORIGINAL',
    "direction" "MoneyDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "reason" TEXT,
    "referenceNumber" TEXT,
    "externalReference" TEXT,
    "actorId" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "kind" "SettlementKind" NOT NULL DEFAULT 'ORIGINAL',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancialAccountMovement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "settlementId" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "direction" "MoneyDirection" NOT NULL,
    "provenance" JSONB,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinancialAccountMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Settlement_reversalOfId_key" ON "Settlement"("reversalOfId");
CREATE UNIQUE INDEX "Settlement_organizationId_paymentId_idempotencyKey_key" ON "Settlement"("organizationId", "paymentId", "idempotencyKey");
CREATE INDEX "Settlement_organizationId_paymentId_idx" ON "Settlement"("organizationId", "paymentId");
CREATE INDEX "Settlement_organizationId_occurredAt_idx" ON "Settlement"("organizationId", "occurredAt");
CREATE INDEX "Settlement_financialAccountId_idx" ON "Settlement"("financialAccountId");

CREATE UNIQUE INDEX "Application_reversalOfId_key" ON "Application"("reversalOfId");
CREATE INDEX "Application_organizationId_paymentId_idx" ON "Application"("organizationId", "paymentId");
CREATE INDEX "Application_settlementId_idx" ON "Application"("settlementId");

CREATE UNIQUE INDEX "FinancialAccountMovement_reversalOfId_key" ON "FinancialAccountMovement"("reversalOfId");
CREATE INDEX "FinancialAccountMovement_organizationId_financialAccountId_occurredAt_idx" ON "FinancialAccountMovement"("organizationId", "financialAccountId", "occurredAt");
CREATE INDEX "FinancialAccountMovement_settlementId_idx" ON "FinancialAccountMovement"("settlementId");

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Application" ADD CONSTRAINT "Application_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialAccountMovement" ADD CONSTRAINT "FinancialAccountMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialAccountMovement" ADD CONSTRAINT "FinancialAccountMovement_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinancialAccountMovement" ADD CONSTRAINT "FinancialAccountMovement_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinancialAccountMovement" ADD CONSTRAINT "FinancialAccountMovement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "FinancialAccountMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
