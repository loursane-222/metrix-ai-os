CREATE TABLE "CustomerDocumentAttachment" (
    "id" UUID NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "conversationId" UUID,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "extractionStatus" TEXT NOT NULL DEFAULT 'READY',
    "extractionRequestId" TEXT,
    "extractionPayload" JSONB,
    "extractionErrorCode" TEXT,
    "extractedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomerDocumentAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerDocumentAttachment_organizationId_actorUserId_expiresAt_idx" ON "CustomerDocumentAttachment"("organizationId", "actorUserId", "expiresAt");
CREATE INDEX "CustomerDocumentAttachment_conversationId_idx" ON "CustomerDocumentAttachment"("conversationId");
CREATE INDEX "CustomerDocumentAttachment_expiresAt_idx" ON "CustomerDocumentAttachment"("expiresAt");
ALTER TABLE "CustomerDocumentAttachment" ADD CONSTRAINT "CustomerDocumentAttachment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerDocumentAttachment" ADD CONSTRAINT "CustomerDocumentAttachment_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerDocumentAttachment" ADD CONSTRAINT "CustomerDocumentAttachment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
