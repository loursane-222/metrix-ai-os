/**
 * Residual Capability Parity Migration — calendar-management closure.
 *
 * calendar_event.create/update/status_transition/reschedule are already
 * full canonical Action Registry actions (calendar.actions.ts) reachable
 * through execute_business_action, INCLUDING native conflict detection
 * (CanonicalOperationResultV1 status "CONFLICT" + an allowConflict input
 * flag — calendar-event-create-handler.ts/calendar-event-reschedule-
 * handler.ts) — the client extension's own 409+"confirm/discard conflict"
 * dance was a legacy client-side reimplementation of something the
 * canonical action already does. No new plumbing was needed for writes or
 * conflict confirmation: the Agent asks the user, then calls
 * execute_business_action again with allowConflict: true.
 *
 * What genuinely needed a new home: the DETERMINISTIC Turkish weekday/time
 * arithmetic (calendar-management-conversation-extension.ts's own
 * resolveStartAt) and organization-member name resolution for
 * `participants`/availability. Per this operation's explicit "do not let
 * the model invent absolute dates" requirement, resolve_calendar_expression
 * below is the exact same DAY_INDEX/offset arithmetic the retired
 * extension used — moved, not rewritten — so "pazartesi" always resolves
 * to a real next-Monday date computed by this function, never guessed by
 * the model.
 */

import { z } from "zod";
import { tool } from "@openai/agents";
import { resolvedEvidence, type ExecutiveAgentRunContext } from "../types";
import { listOrganizationMemberRecords } from "@/lib/core/organization-members/organization-member.repository";
import { resolveOrganizationMemberByName } from "@/lib/core/organization-members/member-name-resolution";
import { computeAvailability } from "@/lib/core/calendar/calendar-intelligence.service";

const DAY_INDEX: Readonly<Record<string, number>> = { pazar: 0, pazartesi: 1, sali: 2, carsamba: 3, persembe: 4, cuma: 5, cumartesi: 6 };
const normalize = (value: string) => value.toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ğ/g, "g");

// Verbatim port of calendar-management-conversation-extension.ts's own
// resolveStartAt — same DAY_INDEX table, same "next occurrence, rolling
// over to next week if today's already past" rule. `now` is the server
// clock (real current time), never a client-supplied or model-invented
// value.
function resolveDayExpression(expression: string, hours: number, minutes: number, now: Date): Date | null {
  if (hours > 23 || minutes > 59) return null;
  const normalized = normalize(expression);
  const startAt = new Date(now);
  startAt.setHours(hours, minutes, 0, 0);
  if (normalized === "bugun") return startAt;
  if (normalized === "yarin") { startAt.setDate(startAt.getDate() + 1); return startAt; }
  const targetDay = DAY_INDEX[normalized];
  if (targetDay === undefined) return null;
  let dayOffset = (targetDay - now.getDay() + 7) % 7;
  if (dayOffset === 0 && startAt.getTime() <= now.getTime()) dayOffset = 7;
  startAt.setDate(startAt.getDate() + dayOffset);
  return startAt;
}

export function buildResolveCalendarExpressionTool() {
  return tool({
    name: "resolve_calendar_expression",
    description:
      "Deterministically resolves a Turkish relative-day expression (\"bugün\", \"yarın\", \"pazartesi\" through \"cumartesi\") plus an hour/minute into an EXACT ISO date-time, computed from the real server clock — never invent or guess \"today\"/\"next Monday\" yourself. " +
      "Always call this before calendar_event.create/reschedule whenever the user's request contains a relative day word; use the returned startAtIso directly as that action's startAt.",
    parameters: z.object({
      dayExpression: z.enum(["bugün", "yarın", "pazartesi", "salı", "çarşamba", "perşembe", "cuma", "cumartesi", "pazar"]).describe("The relative-day word from the user's message."),
      hours: z.number().int().min(0).max(23).describe("Hour, 24h format."),
      minutes: z.number().int().min(0).max(59),
    }),
    async execute(input) {
      const resolved = resolveDayExpression(input.dayExpression, input.hours, input.minutes, new Date());
      if (!resolved) {
        return resolvedEvidence({ factScope: "calendar.resolve_expression", data: { status: "INVALID" as const }, source: "calendar-semantic-tools" });
      }
      return resolvedEvidence({ factScope: "calendar.resolve_expression", data: { status: "RESOLVED" as const, startAtIso: resolved.toISOString() }, source: "calendar-semantic-tools" });
    },
  });
}

export function buildFindOrganizationMemberForCalendarTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "find_organization_member_for_calendar",
    description: "Resolves a colleague's name to their real organization-member id, for use as a calendar_event participant or an availability lookup. Never guess an id yourself — this is the only source of a real one.",
    parameters: z.object({ nameRaw: z.string().describe("The colleague's name as the user said it.") }),
    async execute(input) {
      const members = await listOrganizationMemberRecords(runContext.organizationId);
      const active = members.filter((member) => member.status === "ACTIVE");
      const resolution = resolveOrganizationMemberByName(active, input.nameRaw);
      return resolvedEvidence({ factScope: "calendar.find_member", data: resolution, source: "organization-member.repository" });
    },
  });
}

export function buildQueryMemberAvailabilityTool(runContext: ExecutiveAgentRunContext) {
  return tool({
    name: "query_member_availability",
    description: "Real-time availability (free/in a meeting/focus time/etc.) for a colleague at a given moment, from their actual calendar. Resolve their memberId with find_organization_member_for_calendar first.",
    parameters: z.object({
      memberId: z.string().describe("The organization member's real id, from find_organization_member_for_calendar."),
      atIso: z.string().describe("The moment to check, ISO 8601 — defaults to now if the user didn't specify one."),
    }),
    async execute(input) {
      const at = new Date(input.atIso);
      if (Number.isNaN(at.getTime())) {
        return resolvedEvidence({ factScope: "calendar.member_availability", data: { status: "INVALID_DATE" as const }, source: "calendar-intelligence.service" });
      }
      const availability = await computeAvailability(input.memberId, runContext.organizationId, at);
      return resolvedEvidence({ factScope: "calendar.member_availability", data: availability, source: "calendar-intelligence.service" });
    },
  });
}
