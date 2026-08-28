import type { OrganizationRole } from "@prisma/client";
import { listFieldVisits } from "@/lib/core/field-visits/field-visit.service";
import type { FieldVisitRequestType } from "@/lib/core/field-visits/field-visit.types";
import { listPayments } from "@/lib/core/payments/payment.service";
import type { FieldVisitWeeklySummary, FieldVisitWeeklySummaryAccessResult } from "./field-visit-weekly-summary.types";

const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

// A role that may view another rep's week or the whole team's. A plain
// EMPLOYEE may only ever ask for their own week.
const MANAGER_ROLES: readonly OrganizationRole[] = ["TEAM_LEAD", "MANAGER", "EXECUTIVE", "OWNER"];

function istanbulCalendarDate(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function istanbulMidnightUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - ISTANBUL_OFFSET_MS);
}

function dateLabel(parts: { year: number; month: number; day: number }): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/**
 * Monday 00:00 (inclusive) .. next Monday 00:00 (exclusive), Europe/Istanbul
 * — Turkey has run permanently on UTC+3 since 2016, so the fixed offset used
 * here is correct, not a simplification that will drift.
 */
export function resolveIstanbulWeekBounds(reference: Date): { start: Date; end: Date; weekStart: string; weekEnd: string } {
  const today = istanbulCalendarDate(reference);
  const todayMidnight = istanbulMidnightUtc(today.year, today.month, today.day);
  const weekdayUtc = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay(); // 0=Sun..6=Sat
  const mondayOffsetDays = weekdayUtc === 0 ? 6 : weekdayUtc - 1;
  const start = new Date(todayMidnight.getTime() - mondayOffsetDays * 86_400_000);
  const end = new Date(start.getTime() + 7 * 86_400_000);
  return {
    start,
    end,
    weekStart: dateLabel(istanbulCalendarDate(start)),
    weekEnd: dateLabel(istanbulCalendarDate(new Date(end.getTime() - 86_400_000))),
  };
}

const EMPTY_REQUEST_TYPE_COUNTS: Record<FieldVisitRequestType, number> = { DISPLAY_REQUEST: 0, SAMPLE_REQUEST: 0, OTHER: 0 };

/**
 * repUserId omitted means "the whole team" — listFieldVisits already
 * supports this (organization-wide, no per-rep filter).
 */
export async function buildFieldVisitWeeklySummary(input: {
  organizationId: string;
  repUserId?: string;
  reference?: Date;
}): Promise<FieldVisitWeeklySummary> {
  const bounds = resolveIstanbulWeekBounds(input.reference ?? new Date());
  const visits = await listFieldVisits({
    organizationId: input.organizationId,
    repUserId: input.repUserId,
    startAt: bounds.start,
    endAt: bounds.end,
  });

  const distinctCustomers = new Set<string>();
  const distinctReps = new Set<string>();
  const requestTypeCounts: Record<FieldVisitRequestType, number> = { ...EMPTY_REQUEST_TYPE_COUNTS };
  let linkedOrderCount = 0;
  const linkedPaymentIds: string[] = [];
  let openUnresolvedIntentCount = 0;

  for (const visit of visits) {
    distinctCustomers.add(visit.customerId ?? `raw:${visit.customerNameRaw}`);
    distinctReps.add(visit.repUserId);
    const requestTypes = Array.isArray(visit.requestTypesJson) ? (visit.requestTypesJson as unknown[]) : [];
    for (const type of requestTypes) {
      if (type === "DISPLAY_REQUEST" || type === "SAMPLE_REQUEST" || type === "OTHER") requestTypeCounts[type] += 1;
    }
    if (visit.relatedOrderId) linkedOrderCount += 1;
    if (visit.relatedPaymentId) linkedPaymentIds.push(visit.relatedPaymentId);
    if (visit.unresolvedIntent) openUnresolvedIntentCount += 1;
  }

  let linkedPaymentTotal = 0;
  if (linkedPaymentIds.length > 0) {
    const idSet = new Set(linkedPaymentIds);
    const payments = await listPayments(input.organizationId);
    linkedPaymentTotal = payments
      .filter((payment) => idSet.has(payment.id))
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
  }

  return {
    repUserId: input.repUserId ?? null,
    weekStart: bounds.weekStart,
    weekEnd: bounds.weekEnd,
    visitCount: visits.length,
    distinctCustomerCount: distinctCustomers.size,
    distinctRepCount: distinctReps.size,
    requestTypeCounts,
    linkedOrderCount,
    linkedPaymentCount: linkedPaymentIds.length,
    linkedPaymentTotal,
    openUnresolvedIntentCount,
  };
}

/**
 * "Own week" is always allowed. Anything else (a named colleague, or the
 * whole team — targetRepUserId undefined) requires a manager-tier role —
 * a plain EMPLOYEE/TEAM_LEAD asking for someone else's week gets a clean
 * DENIED rather than a silently wrong or empty answer.
 */
export async function resolveFieldVisitWeeklySummaryForRequest(input: {
  organizationId: string;
  actorUserId: string;
  actorRole: OrganizationRole;
  targetRepUserId?: string;
  reference?: Date;
}): Promise<FieldVisitWeeklySummaryAccessResult> {
  const isOwnWeek = input.targetRepUserId !== undefined && input.targetRepUserId === input.actorUserId;
  if (!isOwnWeek && !MANAGER_ROLES.includes(input.actorRole)) return { status: "DENIED" };

  const summary = await buildFieldVisitWeeklySummary({
    organizationId: input.organizationId,
    repUserId: input.targetRepUserId,
    reference: input.reference,
  });
  return { status: "ALLOWED", summary };
}
