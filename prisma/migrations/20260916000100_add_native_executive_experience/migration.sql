-- Forward-only persistence for calendar, artifacts, approvals, notifications.
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'EXECUTED');
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

CREATE TABLE "CalendarEvent" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL, "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
  "allDay" BOOLEAN NOT NULL DEFAULT false, "notes" TEXT, "idempotencyKey" TEXT,
  "requestHash" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Artifact" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "kind" TEXT NOT NULL, "title" TEXT NOT NULL,
  "version" INTEGER NOT NULL, "sourceType" TEXT NOT NULL, "sourceId" TEXT NOT NULL,
  "sourceSnapshot" TEXT NOT NULL, "contentHtml" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ApprovalRequest" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "requestedById" TEXT NOT NULL,
  "actionType" TEXT NOT NULL, "payload" TEXT NOT NULL, "snapshotHash" TEXT NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING', "expiresAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Notification" (
  "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "category" TEXT NOT NULL, "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
  "title" TEXT NOT NULL, "body" TEXT, "sourceType" TEXT, "sourceId" TEXT,
  "readAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CalendarEvent_organizationId_idempotencyKey_key" ON "CalendarEvent"("organizationId", "idempotencyKey");
CREATE INDEX "CalendarEvent_organizationId_userId_startsAt_idx" ON "CalendarEvent"("organizationId", "userId", "startsAt");
CREATE UNIQUE INDEX "Artifact_organizationId_kind_sourceType_sourceId_version_key" ON "Artifact"("organizationId", "kind", "sourceType", "sourceId", "version");
CREATE INDEX "Artifact_organizationId_sourceType_sourceId_idx" ON "Artifact"("organizationId", "sourceType", "sourceId");
CREATE INDEX "ApprovalRequest_organizationId_requestedById_status_idx" ON "ApprovalRequest"("organizationId", "requestedById", "status");
CREATE INDEX "Notification_organizationId_userId_readAt_idx" ON "Notification"("organizationId", "userId", "readAt");
CREATE INDEX "Notification_organizationId_priority_createdAt_idx" ON "Notification"("organizationId", "priority", "createdAt");
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
