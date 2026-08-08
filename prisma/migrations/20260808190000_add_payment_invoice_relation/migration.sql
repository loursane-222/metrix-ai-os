-- Additive-only Payment ↔ Invoice relation. Existing payments remain NULL.
ALTER TABLE "Payment" ADD COLUMN "invoiceId" TEXT;

CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
