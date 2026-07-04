-- Add lifecycle tracking fields to CollectionAction

ALTER TABLE "CollectionAction"
  ADD COLUMN "expectedPaymentDate" TIMESTAMP(3),
  ADD COLUMN "lastContactAt"       TIMESTAMP(3);
