CREATE TABLE "IcloudConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appleId" TEXT NOT NULL,
    "appSpecificPasswordEncrypted" TEXT NOT NULL,
    "caldavPrincipalUrl" TEXT,
    "caldavHomeSetUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONNECTED',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSuccessfulAccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IcloudConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "IcloudConnection_organizationId_userId_key" ON "IcloudConnection"("organizationId", "userId");
CREATE INDEX "IcloudConnection_organizationId_userId_status_idx" ON "IcloudConnection"("organizationId", "userId", "status");
ALTER TABLE "IcloudConnection" ADD CONSTRAINT "IcloudConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IcloudConnection" ADD CONSTRAINT "IcloudConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
