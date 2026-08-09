CREATE TYPE "CalendarEventBlockType" AS ENUM ('MEETING', 'FOCUS_TIME', 'TRAVEL', 'LEAVE', 'PRODUCTION', 'DO_NOT_DISTURB', 'CUSTOMER_VISIT');
ALTER TABLE "CalendarEvent" ADD COLUMN "blockType" "CalendarEventBlockType";
