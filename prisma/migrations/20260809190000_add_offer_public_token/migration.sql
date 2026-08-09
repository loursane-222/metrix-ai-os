ALTER TABLE "Quote" ADD COLUMN "publicTokenHash" TEXT,
ADD COLUMN "publicTokenCreatedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Quote_publicTokenHash_key" ON "Quote"("publicTokenHash");
