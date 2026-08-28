// Executive Autonomous Watch — the "kullanıcıyı önceden uyarır, krizleri
// görür" half of the AI Genel Müdür promise (see docs/constitution/source/
// metrix-liderlik-dnasi.md §1.1-1.2). Runs independent of any live chat
// session (invoked by a scheduled GitHub Actions workflow, the same pattern
// already proven by daily-briefing.yml → /api/briefing/generate), so METRIX
// can notice a real business risk and tell the owner about it before they
// ever ask — not just answer questions when spoken to.
//
// Deliberately reuses buildExecutiveAlerts (src/lib/executive-alerts), which
// already existed with a real, tested threshold/severity model but had zero
// callers anywhere in the app — this wires it to its first real consumer
// instead of reinventing signal detection.
import { buildExecutiveOperatingContext } from "@/lib/executive-operating-context";
import { buildExecutiveAlerts } from "@/lib/executive-alerts/executive-alert-engine.service";
import type { AlertSeverity, ExecutiveAlert } from "@/lib/executive-alerts/executive-alert.types";
import { listActiveNotificationRecipientRecords } from "@/lib/core/organization-members/organization-member.repository";
import { notify } from "@/lib/core/notifications/notification.service";
import { listOrganizationIds } from "@/lib/core/organizations/organization.repository";
import { prisma } from "@/lib/core/shared/prisma";

// A CRITICAL/HIGH alert re-notifies at most once per window, so the same
// standing risk (e.g. an overdue collection) doesn't re-alert every run —
// but a genuinely new day's alert (different alert.id) always goes through.
const RENOTIFY_WINDOW_HOURS = 20;
const NOTIFICATION_ENTITY_TYPE = "ExecutiveAlert";
const NOTIFICATION_TYPE = "executive_alert.raised";

export type ExecutiveWatchOrganizationResult = Readonly<{
  organizationId: string;
  alertsFound: number;
  notificationsSent: number;
  skipped: boolean;
}>;

export type ExecutiveWatchBatchResult = Readonly<{
  processed: number;
  totalAlertsFound: number;
  totalNotificationsSent: number;
  results: readonly ExecutiveWatchOrganizationResult[];
}>;

export async function runExecutiveWatchForOrganization(
  organizationId: string,
): Promise<ExecutiveWatchOrganizationResult> {
  const operatingContext = await buildExecutiveOperatingContext({
    organizationId,
    mode: "BRIEFING",
    writePolicy: {
      syncCollectionActions: false,
      writeSignalSnapshot: false,
      writeDecisionRecords: false,
    },
  });

  const bundle = buildExecutiveAlerts({
    organizationId,
    executiveForecast: operatingContext.executiveForecast,
    latestBriefing: null,
    paymentIntelligence: operatingContext.paymentIntelligence,
    collectionActionContext: operatingContext.collectionActionContext,
  });

  const notifiable = [...bundle.criticalAlerts, ...bundle.highAlerts];
  if (notifiable.length === 0) {
    return { organizationId, alertsFound: 0, notificationsSent: 0, skipped: false };
  }

  const members = await listActiveNotificationRecipientRecords(organizationId);
  const recipients = members.filter((member) => member.role === "OWNER" || member.role === "EXECUTIVE");
  if (recipients.length === 0) {
    return { organizationId, alertsFound: notifiable.length, notificationsSent: 0, skipped: true };
  }

  const alreadyNotified = await findRecentlyNotifiedAlertIds(organizationId);
  const dueAlerts = notifiable.filter((alert) => !alreadyNotified.has(alert.id));

  let notificationsSent = 0;
  for (const alert of dueAlerts) {
    await Promise.all(
      recipients.map((recipient) =>
        notify({
          organizationId,
          recipientUserId: recipient.userId,
          type: NOTIFICATION_TYPE,
          title: buildAlertTitle(alert),
          body: alert.actionableStep ?? undefined,
          severity: alertSeverityToNotificationSeverity(alert.severity),
          entityType: NOTIFICATION_ENTITY_TYPE,
          entityId: alert.id,
        }),
      ),
    );
    notificationsSent += 1;
  }

  return { organizationId, alertsFound: notifiable.length, notificationsSent, skipped: false };
}

export async function runExecutiveWatch(): Promise<ExecutiveWatchBatchResult> {
  const organizationIds = await listOrganizationIds();
  const results: ExecutiveWatchOrganizationResult[] = [];

  for (const organizationId of organizationIds) {
    try {
      results.push(await runExecutiveWatchForOrganization(organizationId));
    } catch {
      results.push({ organizationId, alertsFound: 0, notificationsSent: 0, skipped: true });
    }
  }

  return {
    processed: results.length,
    totalAlertsFound: results.reduce((sum, r) => sum + r.alertsFound, 0),
    totalNotificationsSent: results.reduce((sum, r) => sum + r.notificationsSent, 0),
    results,
  };
}

async function findRecentlyNotifiedAlertIds(organizationId: string): Promise<Set<string>> {
  const since = new Date(Date.now() - RENOTIFY_WINDOW_HOURS * 60 * 60 * 1000);
  const rows = await prisma.notification.findMany({
    where: { organizationId, entityType: NOTIFICATION_ENTITY_TYPE, createdAt: { gte: since } },
    select: { entityId: true },
  });
  return new Set(rows.map((row) => row.entityId).filter((id): id is string => id !== null));
}

function buildAlertTitle(alert: ExecutiveAlert): string {
  const prefix = alert.severity === "CRITICAL" ? "Kritik" : "Önemli";
  return `METRIX uyarısı (${prefix}): ${alert.headline}`;
}

function alertSeverityToNotificationSeverity(severity: AlertSeverity): "CRITICAL" | "WARNING" {
  return severity === "CRITICAL" ? "CRITICAL" : "WARNING";
}
