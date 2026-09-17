-- AlterTable
ALTER TABLE "LiveDiagnosticEvent" ADD COLUMN     "closeCode" INTEGER,
ADD COLUMN     "closeReason" TEXT,
ADD COLUMN     "errorCauseCode" TEXT,
ADD COLUMN     "errorCauseErrno" TEXT,
ADD COLUMN     "errorCauseName" TEXT,
ADD COLUMN     "errorCauseSyscall" TEXT,
ADD COLUMN     "sequence" INTEGER,
ADD COLUMN     "socketReadyState" INTEGER;

-- CreateIndex
CREATE INDEX "LiveDiagnosticEvent_bindingId_sequence_idx" ON "LiveDiagnosticEvent"("bindingId", "sequence");
