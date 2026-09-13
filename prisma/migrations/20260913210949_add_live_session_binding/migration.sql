-- CreateEnum
CREATE TYPE "LiveSessionStatus" AS ENUM ('BOOTSTRAPPING', 'CONNECTED', 'DISCONNECTED', 'CLOSED', 'FAILED');

-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "openAiSessionId" TEXT,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "LiveSessionStatus" NOT NULL DEFAULT 'BOOTSTRAPPING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectedAt" TIMESTAMP(3),
    "sidebandAttachedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "failureCode" TEXT,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiveSession_openAiSessionId_key" ON "LiveSession"("openAiSessionId");

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
