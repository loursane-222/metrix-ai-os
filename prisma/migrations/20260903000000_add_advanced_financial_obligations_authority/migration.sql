-- CreateEnum
CREATE TYPE "CorporateCardStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CardStatementStatus" AS ENUM ('OPEN', 'CLOSED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmployeeAdvanceStatus" AS ENUM ('OUTSTANDING', 'PARTIALLY_RECONCILED', 'RECONCILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'CLOSED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerSourceType" ADD VALUE 'CARD_STATEMENT_PAYMENT';
ALTER TYPE "LedgerSourceType" ADD VALUE 'EMPLOYEE_ADVANCE_MOVEMENT';
ALTER TYPE "LedgerSourceType" ADD VALUE 'EMPLOYEE_ADVANCE_RECONCILIATION';
ALTER TYPE "LedgerSourceType" ADD VALUE 'LOAN_DRAWDOWN';
ALTER TYPE "LedgerSourceType" ADD VALUE 'LOAN_REPAYMENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ObligationSourceType" ADD VALUE 'CARD_STATEMENT';
ALTER TYPE "ObligationSourceType" ADD VALUE 'LOAN_INSTALLMENT';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "cardStatementId" TEXT,
ADD COLUMN     "corporateCardId" TEXT;

-- AlterTable
ALTER TABLE "FinancialAccountMovement" ADD COLUMN     "cardStatementPaymentId" TEXT,
ADD COLUMN     "employeeAdvanceMovementId" TEXT,
ADD COLUMN     "loanDrawdownId" TEXT,
ADD COLUMN     "loanRepaymentId" TEXT;

-- AlterTable
ALTER TABLE "ObligationScheduleLine" ADD COLUMN     "cardStatementId" TEXT,
ADD COLUMN     "interestAmount" DECIMAL(14,2),
ADD COLUMN     "loanInstallmentId" TEXT,
ADD COLUMN     "principalAmount" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "CorporateCard" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cardholderMemberId" TEXT NOT NULL,
    "bankName" TEXT,
    "last4" TEXT,
    "label" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "CorporateCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorporateCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardStatement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "corporateCardId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" DECIMAL(14,2),
    "currency" TEXT NOT NULL,
    "status" "CardStatementStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardStatementPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cardStatementId" TEXT NOT NULL,
    "kind" "SettlementKind" NOT NULL DEFAULT 'ORIGINAL',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardStatementPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAdvance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeMemberId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "EmployeeAdvanceStatus" NOT NULL DEFAULT 'OUTSTANDING',
    "reconciledAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "actorId" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAdvanceMovement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeAdvanceId" TEXT NOT NULL,
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
    "actorId" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeAdvanceMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAdvanceReconciliation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeAdvanceId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "kind" "SettlementKind" NOT NULL DEFAULT 'ORIGINAL',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeAdvanceReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "lenderName" TEXT NOT NULL,
    "principalAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "interestRate" DECIMAL(7,4),
    "startDate" TIMESTAMP(3) NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanInstallment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "installmentIndex" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "principalAmount" DECIMAL(14,2) NOT NULL,
    "interestAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanDrawdown" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "kind" "SettlementKind" NOT NULL DEFAULT 'ORIGINAL',
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanDrawdown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanRepayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "loanInstallmentId" TEXT NOT NULL,
    "kind" "SettlementKind" NOT NULL DEFAULT 'ORIGINAL',
    "amount" DECIMAL(14,2) NOT NULL,
    "principalPortion" DECIMAL(14,2) NOT NULL,
    "interestPortion" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "financialAccountId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT,
    "requestHash" TEXT,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CorporateCard_organizationId_status_idx" ON "CorporateCard"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CorporateCard_organizationId_cardholderMemberId_idx" ON "CorporateCard"("organizationId", "cardholderMemberId");

-- CreateIndex
CREATE INDEX "CardStatement_organizationId_status_idx" ON "CardStatement"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CardStatement_organizationId_dueDate_idx" ON "CardStatement"("organizationId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "CardStatement_organizationId_corporateCardId_periodStart_pe_key" ON "CardStatement"("organizationId", "corporateCardId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "CardStatementPayment_reversalOfId_key" ON "CardStatementPayment"("reversalOfId");

-- CreateIndex
CREATE INDEX "CardStatementPayment_organizationId_cardStatementId_idx" ON "CardStatementPayment"("organizationId", "cardStatementId");

-- CreateIndex
CREATE INDEX "CardStatementPayment_organizationId_occurredAt_idx" ON "CardStatementPayment"("organizationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "CardStatementPayment_organizationId_cardStatementId_idempot_key" ON "CardStatementPayment"("organizationId", "cardStatementId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "EmployeeAdvance_organizationId_status_idx" ON "EmployeeAdvance"("organizationId", "status");

-- CreateIndex
CREATE INDEX "EmployeeAdvance_organizationId_employeeMemberId_idx" ON "EmployeeAdvance"("organizationId", "employeeMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeAdvanceMovement_reversalOfId_key" ON "EmployeeAdvanceMovement"("reversalOfId");

-- CreateIndex
CREATE INDEX "EmployeeAdvanceMovement_organizationId_employeeAdvanceId_idx" ON "EmployeeAdvanceMovement"("organizationId", "employeeAdvanceId");

-- CreateIndex
CREATE INDEX "EmployeeAdvanceMovement_organizationId_occurredAt_idx" ON "EmployeeAdvanceMovement"("organizationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeAdvanceMovement_organizationId_employeeAdvanceId_id_key" ON "EmployeeAdvanceMovement"("organizationId", "employeeAdvanceId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeAdvanceReconciliation_reversalOfId_key" ON "EmployeeAdvanceReconciliation"("reversalOfId");

-- CreateIndex
CREATE INDEX "EmployeeAdvanceReconciliation_organizationId_employeeAdvanc_idx" ON "EmployeeAdvanceReconciliation"("organizationId", "employeeAdvanceId");

-- CreateIndex
CREATE INDEX "EmployeeAdvanceReconciliation_organizationId_expenseId_idx" ON "EmployeeAdvanceReconciliation"("organizationId", "expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeAdvanceReconciliation_organizationId_employeeAdvanc_key" ON "EmployeeAdvanceReconciliation"("organizationId", "employeeAdvanceId", "expenseId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Loan_organizationId_status_idx" ON "Loan"("organizationId", "status");

-- CreateIndex
CREATE INDEX "LoanInstallment_organizationId_loanId_idx" ON "LoanInstallment"("organizationId", "loanId");

-- CreateIndex
CREATE INDEX "LoanInstallment_organizationId_dueDate_idx" ON "LoanInstallment"("organizationId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "LoanInstallment_organizationId_loanId_installmentIndex_key" ON "LoanInstallment"("organizationId", "loanId", "installmentIndex");

-- CreateIndex
CREATE UNIQUE INDEX "LoanDrawdown_reversalOfId_key" ON "LoanDrawdown"("reversalOfId");

-- CreateIndex
CREATE INDEX "LoanDrawdown_organizationId_loanId_idx" ON "LoanDrawdown"("organizationId", "loanId");

-- CreateIndex
CREATE INDEX "LoanDrawdown_organizationId_occurredAt_idx" ON "LoanDrawdown"("organizationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoanDrawdown_organizationId_loanId_idempotencyKey_key" ON "LoanDrawdown"("organizationId", "loanId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "LoanRepayment_reversalOfId_key" ON "LoanRepayment"("reversalOfId");

-- CreateIndex
CREATE INDEX "LoanRepayment_organizationId_loanInstallmentId_idx" ON "LoanRepayment"("organizationId", "loanInstallmentId");

-- CreateIndex
CREATE INDEX "LoanRepayment_organizationId_occurredAt_idx" ON "LoanRepayment"("organizationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "LoanRepayment_organizationId_loanInstallmentId_idempotencyK_key" ON "LoanRepayment"("organizationId", "loanInstallmentId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Expense_organizationId_corporateCardId_idx" ON "Expense"("organizationId", "corporateCardId");

-- CreateIndex
CREATE INDEX "Expense_organizationId_cardStatementId_idx" ON "Expense"("organizationId", "cardStatementId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccountMovement_cardStatementPaymentId_key" ON "FinancialAccountMovement"("cardStatementPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccountMovement_employeeAdvanceMovementId_key" ON "FinancialAccountMovement"("employeeAdvanceMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccountMovement_loanDrawdownId_key" ON "FinancialAccountMovement"("loanDrawdownId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccountMovement_loanRepaymentId_key" ON "FinancialAccountMovement"("loanRepaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "ObligationScheduleLine_cardStatementId_key" ON "ObligationScheduleLine"("cardStatementId");

-- CreateIndex
CREATE UNIQUE INDEX "ObligationScheduleLine_loanInstallmentId_key" ON "ObligationScheduleLine"("loanInstallmentId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_corporateCardId_fkey" FOREIGN KEY ("corporateCardId") REFERENCES "CorporateCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_cardStatementId_fkey" FOREIGN KEY ("cardStatementId") REFERENCES "CardStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObligationScheduleLine" ADD CONSTRAINT "ObligationScheduleLine_cardStatementId_fkey" FOREIGN KEY ("cardStatementId") REFERENCES "CardStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObligationScheduleLine" ADD CONSTRAINT "ObligationScheduleLine_loanInstallmentId_fkey" FOREIGN KEY ("loanInstallmentId") REFERENCES "LoanInstallment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorporateCard" ADD CONSTRAINT "CorporateCard_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorporateCard" ADD CONSTRAINT "CorporateCard_cardholderMemberId_fkey" FOREIGN KEY ("cardholderMemberId") REFERENCES "OrganizationMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardStatement" ADD CONSTRAINT "CardStatement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardStatement" ADD CONSTRAINT "CardStatement_corporateCardId_fkey" FOREIGN KEY ("corporateCardId") REFERENCES "CorporateCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardStatementPayment" ADD CONSTRAINT "CardStatementPayment_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "CardStatementPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardStatementPayment" ADD CONSTRAINT "CardStatementPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardStatementPayment" ADD CONSTRAINT "CardStatementPayment_cardStatementId_fkey" FOREIGN KEY ("cardStatementId") REFERENCES "CardStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardStatementPayment" ADD CONSTRAINT "CardStatementPayment_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvance" ADD CONSTRAINT "EmployeeAdvance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvance" ADD CONSTRAINT "EmployeeAdvance_employeeMemberId_fkey" FOREIGN KEY ("employeeMemberId") REFERENCES "OrganizationMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvanceMovement" ADD CONSTRAINT "EmployeeAdvanceMovement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "EmployeeAdvanceMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvanceMovement" ADD CONSTRAINT "EmployeeAdvanceMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvanceMovement" ADD CONSTRAINT "EmployeeAdvanceMovement_employeeAdvanceId_fkey" FOREIGN KEY ("employeeAdvanceId") REFERENCES "EmployeeAdvance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvanceMovement" ADD CONSTRAINT "EmployeeAdvanceMovement_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvanceReconciliation" ADD CONSTRAINT "EmployeeAdvanceReconciliation_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "EmployeeAdvanceReconciliation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvanceReconciliation" ADD CONSTRAINT "EmployeeAdvanceReconciliation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvanceReconciliation" ADD CONSTRAINT "EmployeeAdvanceReconciliation_employeeAdvanceId_fkey" FOREIGN KEY ("employeeAdvanceId") REFERENCES "EmployeeAdvance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvanceReconciliation" ADD CONSTRAINT "EmployeeAdvanceReconciliation_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanInstallment" ADD CONSTRAINT "LoanInstallment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanDrawdown" ADD CONSTRAINT "LoanDrawdown_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "LoanDrawdown"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanDrawdown" ADD CONSTRAINT "LoanDrawdown_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanDrawdown" ADD CONSTRAINT "LoanDrawdown_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanDrawdown" ADD CONSTRAINT "LoanDrawdown_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanRepayment" ADD CONSTRAINT "LoanRepayment_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "LoanRepayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanRepayment" ADD CONSTRAINT "LoanRepayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanRepayment" ADD CONSTRAINT "LoanRepayment_loanInstallmentId_fkey" FOREIGN KEY ("loanInstallmentId") REFERENCES "LoanInstallment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanRepayment" ADD CONSTRAINT "LoanRepayment_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAccountMovement" ADD CONSTRAINT "FinancialAccountMovement_cardStatementPaymentId_fkey" FOREIGN KEY ("cardStatementPaymentId") REFERENCES "CardStatementPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAccountMovement" ADD CONSTRAINT "FinancialAccountMovement_employeeAdvanceMovementId_fkey" FOREIGN KEY ("employeeAdvanceMovementId") REFERENCES "EmployeeAdvanceMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAccountMovement" ADD CONSTRAINT "FinancialAccountMovement_loanDrawdownId_fkey" FOREIGN KEY ("loanDrawdownId") REFERENCES "LoanDrawdown"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAccountMovement" ADD CONSTRAINT "FinancialAccountMovement_loanRepaymentId_fkey" FOREIGN KEY ("loanRepaymentId") REFERENCES "LoanRepayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "FinancialAccountMovement_organizationId_financialAccountId_occu" RENAME TO "FinancialAccountMovement_organizationId_financialAccountId__idx";

-- RenameIndex
ALTER INDEX "InstrumentAllocation_organizationId_obligationScheduleLineId_id" RENAME TO "InstrumentAllocation_organizationId_obligationScheduleLineI_idx";

-- RenameIndex
ALTER INDEX "ObligationScheduleLine_organizationId_sourceType_sourceId_compo" RENAME TO "ObligationScheduleLine_organizationId_sourceType_sourceId_c_key";

-- RenameIndex
ALTER INDEX "PurchaseInvoice_organizationId_supplierId_supplierInvoiceN_key" RENAME TO "PurchaseInvoice_organizationId_supplierId_supplierInvoiceNu_key";

-- RenameIndex
ALTER INDEX "SupplierPayment_organizationId_purchaseInvoiceId_idempoten_key" RENAME TO "SupplierPayment_organizationId_purchaseInvoiceId_idempotenc_key";

-- Seed the two new LedgerAccount rows Phase 11 introduces (ledger.service.ts
-- ACCOUNT_IDS.employeeAdvanceReceivable / loansPayable) — mirrors the
-- INSERT INTO "LedgerAccount" seeding convention from
-- 20260806130000_add_ledger/migration.sql.
INSERT INTO "LedgerAccount" ("id", "code", "name", "type", "updatedAt") VALUES
    ('ledger-account-135', '135', 'Personel Avans Alacakları', 'ASSET', CURRENT_TIMESTAMP),
    ('ledger-account-400', '400', 'Banka Kredileri', 'LIABILITY', CURRENT_TIMESTAMP);
