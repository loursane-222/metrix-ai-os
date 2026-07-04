-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "personId" TEXT;

-- CreateIndex
CREATE INDEX "Quote_organizationId_personId_idx" ON "Quote"("organizationId", "personId");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ExecutiveDecisionRecord_organizationId_decisionDate_sourceType_" RENAME TO "ExecutiveDecisionRecord_organizationId_decisionDate_sourceT_key";
