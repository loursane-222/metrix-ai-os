-- AlterEnum
ALTER TYPE "ExpenseStatus" ADD VALUE 'PARTIALLY_PAID';
ALTER TYPE "LedgerSourceType" ADD VALUE 'EXPENSE_SETTLEMENT';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "description" TEXT,
ADD COLUMN "subcategory" TEXT,
ADD COLUMN "netAmount" DECIMAL(14,2),
ADD COLUMN "taxRate" DECIMAL(5,2),
ADD COLUMN "taxAmount" DECIMAL(14,2),
ADD COLUMN "paidAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN "supplierId" TEXT,
ADD COLUMN "customerId" TEXT,
ADD COLUMN "employeeMemberId" TEXT,
ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelReason" TEXT;

-- AlterTable
ALTER TABLE "FinancialAccountMovement" ADD COLUMN "expenseSettlementId" TEXT;

-- CreateTable
CREATE TABLE "ExpenseSettlement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
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
    CONSTRAINT "ExpenseSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseSettlement_reversalOfId_key" ON "ExpenseSettlement"("reversalOfId");
CREATE UNIQUE INDEX "ExpenseSettlement_organizationId_expenseId_idempotencyKey_key" ON "ExpenseSettlement"("organizationId", "expenseId", "idempotencyKey");
CREATE INDEX "ExpenseSettlement_organizationId_expenseId_idx" ON "ExpenseSettlement"("organizationId", "expenseId");
CREATE INDEX "ExpenseSettlement_organizationId_occurredAt_idx" ON "ExpenseSettlement"("organizationId", "occurredAt");
CREATE INDEX "ExpenseSettlement_financialAccountId_idx" ON "ExpenseSettlement"("financialAccountId");

CREATE UNIQUE INDEX "FinancialAccountMovement_expenseSettlementId_key" ON "FinancialAccountMovement"("expenseSettlementId");

CREATE INDEX "Expense_organizationId_supplierId_idx" ON "Expense"("organizationId", "supplierId");
CREATE INDEX "Expense_organizationId_customerId_idx" ON "Expense"("organizationId", "customerId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_employeeMemberId_fkey" FOREIGN KEY ("employeeMemberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ExpenseSettlement" ADD CONSTRAINT "ExpenseSettlement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseSettlement" ADD CONSTRAINT "ExpenseSettlement_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseSettlement" ADD CONSTRAINT "ExpenseSettlement_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExpenseSettlement" ADD CONSTRAINT "ExpenseSettlement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "ExpenseSettlement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FinancialAccountMovement" ADD CONSTRAINT "FinancialAccountMovement_expenseSettlementId_fkey" FOREIGN KEY ("expenseSettlementId") REFERENCES "ExpenseSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
