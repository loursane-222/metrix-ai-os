import type { ConversationExtension } from "./conversation-extension-contract";
import { calendarHandoff } from "./conversation-extension-handoff";
import { dispatchConversationNavigation } from "./conversation-navigation-runtime";

// Residual Capability Parity Migration: this extension is narrowed to ONLY
// the pure "open the calendar page" navigation — every mutation/query
// capability it used to also own (create, move/reschedule, availability,
// conflict confirm/discard) is retired. calendar_event.create/update/
// status_transition/reschedule are already full canonical Action Registry
// actions (calendar.actions.ts) reachable through the Executive Agent's
// execute_business_action tool, INCLUDING native conflict detection
// (CanonicalOperationResultV1 status "CONFLICT" + allowConflict input) —
// the client-side 409+"confirm/discard conflict" dance this extension used
// to do was a legacy reimplementation of something the canonical action
// already does. The deterministic Turkish weekday/time arithmetic
// (resolveStartAt) and organization-member name resolution moved to
// calendar-semantic-tools.ts (resolve_calendar_expression,
// find_organization_member_for_calendar, query_member_availability) —
// same logic, same server clock, unchanged — so the Agent still never
// invents an absolute date itself.
const SHOW = /^(?:takvimi|program[ıi]m[ıi])\s+g[öo]ster[.!]?$/iu;

export const calendarManagementConversationExtension: ConversationExtension = {
  getActiveScopeKey: () => typeof window === "undefined" ? null : `calendar:${window.location.pathname}`,
  async execute(utterance, source = "written", correlationId = crypto.randomUUID()) {
    const text = utterance.trim();
    if (!SHOW.test(text)) return { status: "NOT_HANDLED", handoff: null };
    void dispatchConversationNavigation({ route: "/metrix/calendar", source, correlationId, expectedSurfaceAuthorityKey: "calendar.events.page" });
    return {
      status: "HANDOFF",
      handoff: calendarHandoff({ operation: "NAVIGATE", outcomeCode: "CALENDAR_OPENED", resultStatus: "EXECUTED", entityResolution: "RESOLVED", navigationRequested: true, navigationStatus: "COMPLETED" }),
    };
  },
};
