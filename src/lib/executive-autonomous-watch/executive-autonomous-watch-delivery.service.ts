// Delivery adapter (Grand Consolidation §8-9). Notification is not a Stage 2
// brain: this module only executes what the Executive Agent already judged
// INTERVENE-eligible, gated by each recipient's own preference. "Hiç
// konuşmasın" (mute-all) never blocks background evaluation — only this
// final delivery step.

import type { NotificationSeverity } from "@prisma/client";
import { notify } from "@/lib/core/notifications/notification.service";
import { listActiveNotificationRecipientRecords } from "@/lib/core/organization-members/organization-member.repository";
import { prisma } from "@/lib/core/shared/prisma";
import type { AwarenessJudgment, AwarenessNotificationCategory } from "./executive-autonomous-watch.types";

const NOTIFICATION_TYPE = "executive_awareness.insight";
const NOTIFICATION_ENTITY_TYPE = "ExecutiveAwarenessInsight";

export async function deliverJudgment(
  organizationId: string,
  insightId: string,
  judgment: AwarenessJudgment,
): Promise<number> {
  const members = await listActiveNotificationRecipientRecords(organizationId);
  const executives = members.filter((member) => member.role === "OWNER" || member.role === "EXECUTIVE");
  if (executives.length === 0) return 0;

  const preferences = await prisma.organizationMember.findMany({
    where: { organizationId, userId: { in: executives.map((m) => m.userId) } },
    select: { userId: true, awarenessMuteAll: true, awarenessMutedCategories: true },
  });
  const preferenceByUserId = new Map(preferences.map((p) => [p.userId, p]));

  const eligibleRecipients = executives.filter((member) => {
    const preference = preferenceByUserId.get(member.userId);
    if (!preference) return true;
    if (preference.awarenessMuteAll) return false;
    if (isCategoryMuted(preference.awarenessMutedCategories, judgment.category)) return false;
    return true;
  });

  if (eligibleRecipients.length === 0) return 0;

  await Promise.all(
    eligibleRecipients.map((recipient) =>
      notify({
        organizationId,
        recipientUserId: recipient.userId,
        type: NOTIFICATION_TYPE,
        title: judgment.correlationTitle,
        body: judgment.insight,
        severity: significanceToNotificationSeverity(judgment.significance),
        entityType: NOTIFICATION_ENTITY_TYPE,
        entityId: insightId,
      }),
    ),
  );

  return eligibleRecipients.length;
}

function isCategoryMuted(mutedCategoriesJson: unknown, category: AwarenessNotificationCategory): boolean {
  if (!Array.isArray(mutedCategoriesJson)) return false;
  return mutedCategoriesJson.includes(category);
}

function significanceToNotificationSeverity(significance: string): NotificationSeverity {
  if (significance === "CRITICAL" || significance === "HIGH") return "CRITICAL";
  if (significance === "MEDIUM") return "WARNING";
  return "INFO";
}
