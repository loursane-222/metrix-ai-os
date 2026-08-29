// Delivers each rep's personal morning briefing (their monthly goal
// progress + a note-derived suggestion) as a single-recipient Notification
// — mirrors executive-autonomous-watch.service.ts's cron-driven,
// dedup-by-recent-notification pattern exactly, just scoped to one rep
// instead of the OWNER/EXECUTIVE tier.
import { notify } from "@/lib/core/notifications/notification.service";
import { listOrganizationIds } from "@/lib/core/organizations/organization.repository";
import { prisma } from "@/lib/core/shared/prisma";
import { buildRepMorningBriefing } from "./rep-morning-briefing.service";
import { listDistinctPersonGoalOwners } from "./rep-goal.repository";
import type { RepGoalStatus } from "./rep-goal-achievement.service";

const NOTIFICATION_TYPE = "rep_morning_briefing.delivered";
const NOTIFICATION_ENTITY_TYPE = "RepMorningBriefing";
// Once-per-day cadence — a rep shouldn't get re-pinged on every workflow
// retry or manual dispatch within the same morning.
const RENOTIFY_WINDOW_HOURS = 20;

export type RepMorningBriefingOrganizationResult = Readonly<{
  organizationId: string;
  briefingsSent: number;
  skipped: boolean;
}>;

export type RepMorningBriefingBatchResult = Readonly<{
  processed: number;
  totalBriefingsSent: number;
  results: readonly RepMorningBriefingOrganizationResult[];
}>;

function formatGoalLine(status: RepGoalStatus): string | null {
  const parts: string[] = [];
  if (status.visitTarget !== null) parts.push(`${status.visitActual}/${status.visitTarget} ziyaret`);
  if (status.salesTarget !== null) parts.push(`${Math.round(status.salesActual).toLocaleString("tr-TR")}/${Math.round(status.salesTarget).toLocaleString("tr-TR")} TL satış`);
  if (status.collectionTarget !== null) parts.push(`${Math.round(status.collectionActual).toLocaleString("tr-TR")}/${Math.round(status.collectionTarget).toLocaleString("tr-TR")} TL tahsilat`);
  return parts.length > 0 ? `Bu ay: ${parts.join(", ")}.` : null;
}

export async function runRepMorningBriefingForOrganization(
  organizationId: string,
  reference: Date = new Date(),
): Promise<RepMorningBriefingOrganizationResult> {
  const repUserIds = await listDistinctPersonGoalOwners({ organizationId, reference });
  if (repUserIds.length === 0) {
    return { organizationId, briefingsSent: 0, skipped: false };
  }

  const alreadyNotified = await findRecentlyNotifiedRepIds(organizationId);
  let briefingsSent = 0;

  for (const repUserId of repUserIds) {
    if (alreadyNotified.has(repUserId)) continue;

    const briefing = await buildRepMorningBriefing(organizationId, repUserId, reference);
    if (!briefing) continue;

    const body = [formatGoalLine(briefing.goalStatus), briefing.noteSuggestion].filter((line): line is string => Boolean(line)).join(" ");

    await notify({
      organizationId,
      recipientUserId: repUserId,
      type: NOTIFICATION_TYPE,
      title: "Günaydın! Bugünkü hedef durumun",
      body: body || undefined,
      entityType: NOTIFICATION_ENTITY_TYPE,
      entityId: repUserId,
    });
    briefingsSent += 1;
  }

  return { organizationId, briefingsSent, skipped: false };
}

export async function runRepMorningBriefing(): Promise<RepMorningBriefingBatchResult> {
  const organizationIds = await listOrganizationIds();
  const results: RepMorningBriefingOrganizationResult[] = [];

  for (const organizationId of organizationIds) {
    try {
      results.push(await runRepMorningBriefingForOrganization(organizationId));
    } catch {
      results.push({ organizationId, briefingsSent: 0, skipped: true });
    }
  }

  return {
    processed: results.length,
    totalBriefingsSent: results.reduce((sum, result) => sum + result.briefingsSent, 0),
    results,
  };
}

async function findRecentlyNotifiedRepIds(organizationId: string): Promise<Set<string>> {
  const since = new Date(Date.now() - RENOTIFY_WINDOW_HOURS * 60 * 60 * 1000);
  const rows = await prisma.notification.findMany({
    where: { organizationId, entityType: NOTIFICATION_ENTITY_TYPE, createdAt: { gte: since } },
    select: { entityId: true },
  });
  return new Set(rows.map((row) => row.entityId).filter((id): id is string => id !== null));
}
