ALTER TABLE "Order"
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "confirmedValueCents" BIGINT,
  ADD COLUMN "confirmationCurrency" TEXT;

CREATE UNIQUE INDEX "Order_organizationId_sourceQuoteId_key"
  ON "Order"("organizationId", "sourceQuoteId");
