CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'INCOME', 'EXPENSE');
CREATE TYPE "LedgerSourceType" AS ENUM ('INVOICE', 'EXPENSE', 'PAYMENT');

CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LedgerAccountType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "sourceType" "LedgerSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LedgerEntryLine" (
    "id" TEXT NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitCents" BIGINT NOT NULL DEFAULT 0,
    "creditCents" BIGINT NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntryLine_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LedgerEntryLine_one_sided_check" CHECK (("debitCents" > 0 AND "creditCents" = 0) OR ("creditCents" > 0 AND "debitCents" = 0))
);

CREATE UNIQUE INDEX "LedgerAccount_code_key" ON "LedgerAccount"("code");
CREATE UNIQUE INDEX "LedgerEntry_reversalOfId_key" ON "LedgerEntry"("reversalOfId");
CREATE UNIQUE INDEX "LedgerEntry_organizationId_sourceType_sourceId_description_key" ON "LedgerEntry"("organizationId", "sourceType", "sourceId", "description");
CREATE INDEX "LedgerEntry_organizationId_entryDate_idx" ON "LedgerEntry"("organizationId", "entryDate");
CREATE INDEX "LedgerEntry_organizationId_sourceType_sourceId_idx" ON "LedgerEntry"("organizationId", "sourceType", "sourceId");
CREATE INDEX "LedgerEntryLine_ledgerEntryId_idx" ON "LedgerEntryLine"("ledgerEntryId");
CREATE INDEX "LedgerEntryLine_accountId_idx" ON "LedgerEntryLine"("accountId");

ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerEntryLine" ADD CONSTRAINT "LedgerEntryLine_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "LedgerEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LedgerEntryLine" ADD CONSTRAINT "LedgerEntryLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "LedgerAccount" ("id", "code", "name", "type", "updatedAt") VALUES
    ('ledger-account-100', '100', 'Kasa/Banka', 'ASSET', CURRENT_TIMESTAMP),
    ('ledger-account-120', '120', 'Alıcılar', 'ASSET', CURRENT_TIMESTAMP),
    ('ledger-account-320', '320', 'Satıcılar', 'LIABILITY', CURRENT_TIMESTAMP),
    ('ledger-account-391', '391', 'Hesaplanan KDV', 'LIABILITY', CURRENT_TIMESTAMP),
    ('ledger-account-600', '600', 'Yurtiçi Satışlar', 'INCOME', CURRENT_TIMESTAMP),
    ('ledger-account-770', '770', 'Genel Yönetim Gideri', 'EXPENSE', CURRENT_TIMESTAMP);
