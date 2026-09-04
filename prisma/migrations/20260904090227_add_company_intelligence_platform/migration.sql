-- CreateEnum
CREATE TYPE "ConnectorSourceStatus" AS ENUM ('ACTIVE', 'DISABLED', 'ERROR', 'PENDING');

-- CreateEnum
CREATE TYPE "CanonicalEntityStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExternalIdentityMatchMethod" AS ENUM ('EXPLICIT_MAPPING', 'DETERMINISTIC_IDENTIFIER', 'EXACT_NORMALIZED_NAME', 'NEW_CANONICAL_MINTED');

-- CreateTable
CREATE TABLE "ConnectorSource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "ConnectorSourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "connectionMode" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "authoritativeScopes" JSONB NOT NULL DEFAULT '[]',
    "health" JSONB,
    "lastObservedAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonicalEntity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "canonicalDisplayName" TEXT NOT NULL,
    "status" "CanonicalEntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalEntityIdentity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "canonicalEntityId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalEntityType" TEXT NOT NULL,
    "externalEntityId" TEXT NOT NULL,
    "externalDisplayName" TEXT,
    "deterministicIdentifier" TEXT,
    "matchMethod" "ExternalIdentityMatchMethod" NOT NULL,
    "matchConfidence" DECIMAL(4,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalEntityIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConnectorSource_organizationId_status_idx" ON "ConnectorSource"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ConnectorSource_organizationId_sourceType_idx" ON "ConnectorSource"("organizationId", "sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorSource_organizationId_sourceKey_key" ON "ConnectorSource"("organizationId", "sourceKey");

-- CreateIndex
CREATE INDEX "CanonicalEntity_organizationId_entityType_idx" ON "CanonicalEntity"("organizationId", "entityType");

-- CreateIndex
CREATE INDEX "CanonicalEntity_organizationId_status_idx" ON "CanonicalEntity"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ExternalEntityIdentity_organizationId_canonicalEntityId_idx" ON "ExternalEntityIdentity"("organizationId", "canonicalEntityId");

-- CreateIndex
CREATE INDEX "ExternalEntityIdentity_organizationId_deterministicIdentifi_idx" ON "ExternalEntityIdentity"("organizationId", "deterministicIdentifier");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalEntityIdentity_organizationId_sourceId_externalEnti_key" ON "ExternalEntityIdentity"("organizationId", "sourceId", "externalEntityType", "externalEntityId");

-- AddForeignKey
ALTER TABLE "ConnectorSource" ADD CONSTRAINT "ConnectorSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalEntity" ADD CONSTRAINT "CanonicalEntity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalEntityIdentity" ADD CONSTRAINT "ExternalEntityIdentity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalEntityIdentity" ADD CONSTRAINT "ExternalEntityIdentity_canonicalEntityId_fkey" FOREIGN KEY ("canonicalEntityId") REFERENCES "CanonicalEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalEntityIdentity" ADD CONSTRAINT "ExternalEntityIdentity_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ConnectorSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
