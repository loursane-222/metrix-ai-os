-- CreateTable
CREATE TABLE "LiveDiagnosticEvent" (
    "id" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "direction" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "openAiSessionId" TEXT,
    "delegationId" TEXT,
    "responseId" TEXT,
    "callId" TEXT,
    "toolName" TEXT,
    "eventId" TEXT,
    "clientEventId" TEXT,
    "outboundEventId" TEXT,
    "errorType" TEXT,
    "errorCode" TEXT,
    "errorParam" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "LiveDiagnosticEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveDiagnosticEvent_bindingId_createdAt_idx" ON "LiveDiagnosticEvent"("bindingId", "createdAt");

-- AddForeignKey
ALTER TABLE "LiveDiagnosticEvent" ADD CONSTRAINT "LiveDiagnosticEvent_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
