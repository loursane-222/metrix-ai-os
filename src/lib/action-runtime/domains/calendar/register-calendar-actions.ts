import { calendarEventCreateHandler } from "./calendar-event-create-handler";
import { calendarEventUpdateHandler } from "./calendar-event-update-handler";
import { calendarEventStatusTransitionHandler } from "./calendar-event-status-transition-handler";
import { calendarEventRescheduleHandler } from "./calendar-event-reschedule-handler";
import type { ActionHandlerRegistry } from "../../execution";

export function registerCalendarActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("calendar_event.create")) handlerRegistry.registerHandler("calendar_event.create", calendarEventCreateHandler);
  if (!handlerRegistry.hasHandler("calendar_event.update")) handlerRegistry.registerHandler("calendar_event.update", calendarEventUpdateHandler);
  if (!handlerRegistry.hasHandler("calendar_event.status_transition")) handlerRegistry.registerHandler("calendar_event.status_transition", calendarEventStatusTransitionHandler);
  if (!handlerRegistry.hasHandler("calendar_event.reschedule")) handlerRegistry.registerHandler("calendar_event.reschedule", calendarEventRescheduleHandler);
}
