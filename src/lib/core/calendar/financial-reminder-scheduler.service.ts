import { prisma } from "@/lib/core/shared/prisma";
import { listOrganizationIds } from "@/lib/core/organizations/organization.repository";
import { notifyWithOwnerFanout } from "@/lib/core/notifications/notification-fanout.service";
import { computeFinancialObligationProjections, type FinancialCalendarProjectionItem } from "./calendar-financial-projection.service";
import { createFinancialReminderDispatch, findFinancialReminderDispatch } from "./financial-reminder-dispatch.repository";
import { addDaysToDateString, dateStringInTimeZone, DEFAULT_TIME_ZONE } from "./calendar-timezone";
import type { FinancialReminderKind, FinancialReminderSourceType } from "@prisma/client";

const UPCOMING_WINDOW_DAYS = 3;

export type FinancialReminderScanResult = {
  organizationId: string;
  sourceType: FinancialReminderSourceType;
  sourceId: string;
  reminderKind: FinancialReminderKind;
  recipientCount: number;
};

/**
 * §Notification authority — reuses the existing Notification runtime
 * (notifyWithOwnerFanout) exactly as calendar-meeting-reminder.service.ts
 * does; no new notification system. Dedup is the FinancialReminderDispatch
 * unique constraint (organizationId, sourceType, sourceId, reminderKind,
 * dayBucket): a second scan the same day is a no-op, a reversal that
 * reopens an obligation gets a fresh reminder on the NEXT calendar day's
 * scan (dayBucket changes) without any explicit "un-send"/reset logic —
 * see calendar-timezone.ts and the schema comment on FinancialReminderDispatch.
 *
 * Timezone: a single representative timezone (the organization's
 * longest-tenured active OWNER/EXECUTIVE member's User.timezone, default
 * "Europe/Istanbul") drives the org-wide due/overdue classification and
 * dayBucket for this scan — see NOT VERIFIED in the phase report for why
 * this is a deliberate simplification rather than a per-recipient
 * computation.
 */
export async function runFinancialReminderScan(now: Date = new Date()): Promise<FinancialReminderScanResult[]> {
  const organizationIds = await listOrganizationIds();
  const results: FinancialReminderScanResult[] = [];

  for (const organizationId of organizationIds) {
    const timeZone = await resolveOrganizationRepresentativeTimeZone(organizationId);
    const dayBucket = dateStringInTimeZone(now, timeZone);
    const dueDateTo = new Date(`${addDaysToDateString(dayBucket, UPCOMING_WINDOW_DAYS)}T23:59:59.999Z`);

    const items = await computeFinancialObligationProjections({ organizationId, dueDateTo, timeZone, now });

    for (const item of items) {
      if (item.status === "FUTURE") continue;
      const result = await dispatchIfNeeded(organizationId, item, dayBucket);
      if (result) results.push(result);
    }
  }

  return results;
}

async function resolveOrganizationRepresentativeTimeZone(organizationId: string): Promise<string> {
  const member = await prisma.organizationMember.findFirst({
    where: { organizationId, status: "ACTIVE", role: { in: ["OWNER", "EXECUTIVE"] } },
    orderBy: { createdAt: "asc" },
    select: { user: { select: { timezone: true } } },
  });
  return member?.user.timezone ?? DEFAULT_TIME_ZONE;
}

function parseProjectionId(id: string): { sourceType: FinancialReminderSourceType; sourceId: string } {
  const [prefix, sourceId] = id.split(":", 2) as [string, string];
  return { sourceType: prefix === "instrument" ? "FINANCIAL_INSTRUMENT" : "OBLIGATION_SCHEDULE_LINE", sourceId };
}

const KIND_LABEL: Record<FinancialCalendarProjectionItem["status"], string> = {
  OVERDUE: "Vadesi Geçti",
  DUE_TODAY: "Bugün Vadesi Geliyor",
  UPCOMING: "Yaklaşan Vade",
  FUTURE: "",
};

async function dispatchIfNeeded(organizationId: string, item: FinancialCalendarProjectionItem, dayBucket: string): Promise<FinancialReminderScanResult | null> {
  const { sourceType, sourceId } = parseProjectionId(item.id);
  const reminderKind = item.status as Exclude<FinancialCalendarProjectionItem["status"], "FUTURE">;
  const key = { organizationId, sourceType, sourceId, reminderKind, dayBucket };

  const existing = await findFinancialReminderDispatch(key);
  if (existing) return null;

  const fanout = await notifyWithOwnerFanout({
    organizationId,
    type: `financial_reminder.${reminderKind.toLowerCase()}`,
    title: `${KIND_LABEL[item.status]} — ${item.title}`,
    body: `${item.amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${item.currency} — ${new Date(item.dueDate).toLocaleDateString("tr-TR")}`,
    severity: item.status === "OVERDUE" ? "CRITICAL" : item.status === "DUE_TODAY" ? "WARNING" : "INFO",
    entityType: sourceType === "FINANCIAL_INSTRUMENT" ? "FinancialInstrument" : "ObligationScheduleLine",
    entityId: sourceId,
  });

  await createFinancialReminderDispatch({ ...key, amount: item.amount, currency: item.currency });

  return { organizationId, sourceType, sourceId, reminderKind, recipientCount: fanout.notifications.length };
}
