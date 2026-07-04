import {
  findEscalationForDateAndKey,
  createSignalSnapshot,
} from "./executive-signal-snapshot.repository";

import type { ExecutiveSignalSnapshot } from "@prisma/client";
import type { EscalationKey } from "./executive-signal-snapshot.types";
import type { ExecutiveForecast } from "@/lib/executive-forecasting/executive-forecasting.types";

export function getIstanbulDateString(offsetDays: number = 0): string {
  const d = new Date();
  if (offsetDays !== 0) {
    d.setUTCDate(d.getUTCDate() + offsetDays);
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export async function maybeWriteSignalSnapshot(
  organizationId: string,
  snapshotDate: string,
  forecast: ExecutiveForecast,
  existingDailyAnchor: ExecutiveSignalSnapshot | null,
): Promise<void> {
  if (!existingDailyAnchor) {
    await createSignalSnapshot({
      organizationId,
      snapshotDate,
      snapshotType: "DAILY_ANCHOR",
      overallRisk: forecast.overallRiskLevel,
      snapshotPayload: buildSnapshotPayload(forecast),
      escalationFrom: null,
      escalationTo: null,
      escalationKey: null,
    });
    return;
  }

  const escalationKey = detectEscalation(existingDailyAnchor.overallRisk, forecast.overallRiskLevel);
  if (!escalationKey) return;

  const existing = await findEscalationForDateAndKey(organizationId, snapshotDate, escalationKey);
  if (existing) return;

  await createSignalSnapshot({
    organizationId,
    snapshotDate,
    snapshotType: "RISK_ESCALATION",
    overallRisk: forecast.overallRiskLevel,
    snapshotPayload: buildSnapshotPayload(forecast),
    escalationFrom: existingDailyAnchor.overallRisk,
    escalationTo: forecast.overallRiskLevel,
    escalationKey,
  });
}

function detectEscalation(previousRisk: string, currentRisk: string): EscalationKey | null {
  if (previousRisk === "WATCH" && currentRisk === "HIGH") return "WATCH_TO_HIGH";
  if (previousRisk === "HIGH" && currentRisk === "CRITICAL") return "HIGH_TO_CRITICAL";
  return null;
}

function buildSnapshotPayload(forecast: ExecutiveForecast): object {
  return {
    overallRiskLevel: forecast.overallRiskLevel,
    overallConfidence: forecast.overallConfidence,
    signals: forecast.signals.map((s) => ({
      riskType: s.riskType,
      riskLevel: s.riskLevel,
      headline: s.headline,
    })),
    projection: {
      expectedCollection30d: forecast.projection.expectedCollection30d,
      expectedRevenue30d: forecast.projection.expectedRevenue30d,
    },
    executiveSummary: forecast.executiveSummary,
    generatedAt: forecast.generatedAt,
  };
}
