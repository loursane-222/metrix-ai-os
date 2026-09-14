-- CreateTable
CREATE TABLE "ExecutiveConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "openAiConversationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutiveConversation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExecutiveConversation_openAiConversationId_key" ON "ExecutiveConversation"("openAiConversationId");

-- CreateIndex
CREATE INDEX "ExecutiveConversation_organizationId_userId_idx" ON "ExecutiveConversation"("organizationId", "userId");

-- AddForeignKey
ALTER TABLE "ExecutiveConversation" ADD CONSTRAINT "ExecutiveConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutiveConversation" ADD CONSTRAINT "ExecutiveConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
