-- Quote/Payment Idempotency Guard (Faz 2.2)
-- Additive only. Does not drop, rename, or backfill any existing column,
-- table, or row. Adds two parallel, nullable columns to Quote and Payment
-- plus a per-table, organization-scoped unique index. Existing rows keep
-- idempotencyKey/requestHash = NULL, which never collides with itself or
-- with other NULLs under a standard Postgres unique index — no backfill
-- is required or possible for this migration.

-- AlterTable: Quote — parallel idempotency columns
ALTER TABLE "Quote"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "requestHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Quote_organizationId_idempotencyKey_key" ON "Quote"("organizationId", "idempotencyKey");

-- AlterTable: Payment — parallel idempotency columns
ALTER TABLE "Payment"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "requestHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_organizationId_idempotencyKey_key" ON "Payment"("organizationId", "idempotencyKey");
