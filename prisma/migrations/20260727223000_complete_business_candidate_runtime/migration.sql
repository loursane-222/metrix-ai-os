ALTER TABLE "BusinessCandidate"
  ADD COLUMN "propositionId" TEXT,
  ADD COLUMN "entityResolutionStatus" TEXT NOT NULL DEFAULT 'UNRESOLVED',
  ADD COLUMN "verificationRequired" BOOLEAN NOT NULL DEFAULT false;

UPDATE "BusinessCandidate"
SET "propositionId" = "id"
WHERE "propositionId" IS NULL;

ALTER TABLE "BusinessCandidate"
  ALTER COLUMN "propositionId" SET NOT NULL;

CREATE UNIQUE INDEX "BusinessCandidate_organizationId_propositionId_key"
  ON "BusinessCandidate"("organizationId", "propositionId");
