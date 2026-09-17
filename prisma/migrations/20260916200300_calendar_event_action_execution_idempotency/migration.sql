-- Calendar mutations now use the canonical ActionExecution idempotency
-- pattern (actionType "calendar.create" / "calendar.update"), matching every
-- other deterministic kernel action. The event's own ad-hoc idempotency
-- columns are no longer read or written.
DROP INDEX "CalendarEvent_organizationId_idempotencyKey_key";
ALTER TABLE "CalendarEvent" DROP COLUMN "idempotencyKey";
ALTER TABLE "CalendarEvent" DROP COLUMN "requestHash";
