-- Phase 14 (Document Intelligence): additive-only columns on the existing
-- CustomerDocumentAttachment table, reused as the single canonical document
-- attachment surface for the new (non-customer) document pipeline instead
-- of a second, parallel attachment table. No existing column, constraint,
-- or the original customer-document flow's behavior is touched.

-- AlterTable
ALTER TABLE "CustomerDocumentAttachment"
ADD COLUMN     "businessCandidateId" TEXT,
ADD COLUMN     "classificationConfidence" DOUBLE PRECISION,
ADD COLUMN     "classificationPayload" JSONB,
ADD COLUMN     "classifiedDomain" TEXT;

-- CreateIndex
CREATE INDEX "CustomerDocumentAttachment_businessCandidateId_idx" ON "CustomerDocumentAttachment"("businessCandidateId");

-- AddForeignKey
ALTER TABLE "CustomerDocumentAttachment" ADD CONSTRAINT "CustomerDocumentAttachment_businessCandidateId_fkey" FOREIGN KEY ("businessCandidateId") REFERENCES "BusinessCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
