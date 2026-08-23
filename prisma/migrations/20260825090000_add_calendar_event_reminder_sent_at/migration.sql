ALTER TABLE "CalendarEvent" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
CREATE INDEX "CalendarEvent_reminderSentAt_startAt_idx" ON "CalendarEvent"("reminderSentAt", "startAt");
