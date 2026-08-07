CREATE TABLE "ExecutiveMindRuntimeStateRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stateVersion" TEXT NOT NULL DEFAULT 'executive-mind-runtime-state.v1',
    "attentionFocus" TEXT,
    "workingMemoryJson" JSONB NOT NULL,
    "hypothesesJson" JSONB NOT NULL,
    "beliefsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExecutiveMindRuntimeStateRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExecutiveMindRuntimeStateRecord_organizationId_key"
ON "ExecutiveMindRuntimeStateRecord"("organizationId");

ALTER TABLE "ExecutiveMindRuntimeStateRecord"
ADD CONSTRAINT "ExecutiveMindRuntimeStateRecord_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
