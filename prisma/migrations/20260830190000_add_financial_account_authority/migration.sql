CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'CHEQUE', 'PROMISSORY_NOTE', 'OTHER');
CREATE TYPE "FinancialAccountType" AS ENUM ('CASH', 'BANK');
CREATE TYPE "FinancialAccountStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "FinancialAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "FinancialAccountType" NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "FinancialAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "bankName" TEXT,
    "branchName" TEXT,
    "iban" TEXT,
    "accountNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialAccount_organizationId_iban_key" ON "FinancialAccount"("organizationId", "iban");
CREATE INDEX "FinancialAccount_organizationId_status_idx" ON "FinancialAccount"("organizationId", "status");
CREATE INDEX "FinancialAccount_organizationId_type_currency_idx" ON "FinancialAccount"("organizationId", "type", "currency");
CREATE INDEX "FinancialAccount_organizationId_normalizedName_currency_idx" ON "FinancialAccount"("organizationId", "normalizedName", "currency");
CREATE INDEX "FinancialAccount_organizationId_bankName_accountNumber_idx" ON "FinancialAccount"("organizationId", "bankName", "accountNumber");
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
