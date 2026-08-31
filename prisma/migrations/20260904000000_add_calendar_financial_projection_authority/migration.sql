-- CreateEnum
CREATE TYPE "FinancialReminderSourceType" AS ENUM ('OBLIGATION_SCHEDULE_LINE', 'FINANCIAL_INSTRUMENT');

-- CreateEnum
CREATE TYPE "FinancialReminderKind" AS ENUM ('UPCOMING', 'DUE_TODAY', 'OVERDUE');

-- CreateTable
CREATE TABLE "FinancialReminderDispatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceType" "FinancialReminderSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "reminderKind" "FinancialReminderKind" NOT NULL,
    "dayBucket" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialReminderDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialReminderDispatch_organizationId_sourceType_sourceI_idx" ON "FinancialReminderDispatch"("organizationId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialReminderDispatch_organizationId_sourceType_sourceI_key" ON "FinancialReminderDispatch"("organizationId", "sourceType", "sourceId", "reminderKind", "dayBucket");

-- AddForeignKey
ALTER TABLE "FinancialReminderDispatch" ADD CONSTRAINT "FinancialReminderDispatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
