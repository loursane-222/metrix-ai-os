ALTER TABLE "Customer" ADD COLUMN "publicStatementTokenHash" TEXT;
ALTER TABLE "Customer" ADD COLUMN "publicStatementTokenCreatedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Customer_publicStatementTokenHash_key" ON "Customer"("publicStatementTokenHash");
