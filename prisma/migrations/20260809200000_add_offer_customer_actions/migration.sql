ALTER TABLE "Quote" ADD COLUMN "lostReason" TEXT;

CREATE TABLE "QuoteCounterProposal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "proposedAmount" DECIMAL(14,2),
    "proposedPaymentTerm" TEXT,
    "proposedDeliveryTerm" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuoteCounterProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuoteCounterProposal_organizationId_quoteId_idx" ON "QuoteCounterProposal"("organizationId", "quoteId");
ALTER TABLE "QuoteCounterProposal" ADD CONSTRAINT "QuoteCounterProposal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteCounterProposal" ADD CONSTRAINT "QuoteCounterProposal_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
