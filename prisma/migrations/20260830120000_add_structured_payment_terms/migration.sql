ALTER TABLE "Quote" ADD COLUMN "paymentTermStructured" JSONB;
ALTER TABLE "QuoteCounterProposal" ADD COLUMN "proposedPaymentTermStructured" JSONB;
ALTER TABLE "CustomerCommercialTerms" ADD COLUMN "paymentTermStructured" JSONB;
ALTER TABLE "Order" ADD COLUMN "paymentTermSnapshot" JSONB;
ALTER TABLE "Order" ADD COLUMN "paymentTermReferenceDatesSnapshot" JSONB;
ALTER TABLE "Invoice" ADD COLUMN "paymentTermSnapshot" JSONB;
ALTER TABLE "Payment" ADD COLUMN "maturityScheduleComponent" JSONB;

-- Legacy free-text paymentTerm/paymentTermDays values are deliberately not
-- guessed into structured schedules. They remain readable and can be
-- explicitly confirmed through the canonical payment-term validator later.
