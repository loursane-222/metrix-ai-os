import type { ExecutiveSignalSnapshot } from "@prisma/client";
import type {
  EscalationRecord,
  SignalTrendContext,
  TrendDirection,
} from "./signal-trend-context.types";

const RISK_RANK: Record<string, number> = {
  LOW: 0,
  WATCH: 1,
  HIGH: 2,
  CRITICAL: 3,
};

const RISK_LABEL: Record<string, string> = {
  LOW: "DÜŞÜK",
  WATCH: "İZLEME",
  HIGH: "YÜKSEK",
  CRITICAL: "KRİTİK",
};

const TREND_LABEL: Record<TrendDirection, string> = {
  RISING: "Yükseliyor",
  DECLINING: "Düşüyor",
  STABLE: "Stabil",
  UNKNOWN: "Veri yetersiz",
};

export function buildSignalTrendContext(
  snapshots: ExecutiveSignalSnapshot[],
  days: number = 7,
): SignalTrendContext {
  if (snapshots.length === 0) {
    return emptyContext();
  }

  // Group by date, keep the highest risk level per day
  const byDate = new Map<string, string>();
  for (const snap of snapshots) {
    const existing = byDate.get(snap.snapshotDate);
    if (!existing || RISK_RANK[snap.overallRisk] > (RISK_RANK[existing] ?? -1)) {
      byDate.set(snap.snapshotDate, snap.overallRisk);
    }
  }

  const sortedDates = [...byDate.keys()].sort();
  if (sortedDates.length === 0) return emptyContext();

  const currentRiskLevel = byDate.get(sortedDates[sortedDates.length - 1])!;

  // Count consecutive days at current level (from the end, backwards)
  let daysAtCurrentLevel = 0;
  for (let i = sortedDates.length - 1; i >= 0; i--) {
    if (byDate.get(sortedDates[i]) === currentRiskLevel) {
      daysAtCurrentLevel++;
    } else {
      break;
    }
  }

  // Last escalation from RISK_ESCALATION snapshots
  const lastEscalation = resolveLastEscalation(snapshots, currentDate());

  // Trend direction from last 3 recorded days
  const trendDirection = computeTrendDirection(sortedDates, byDate);

  const formattedSummary = buildFormattedSummary({
    currentRiskLevel,
    daysAtCurrentLevel,
    lastEscalation,
    trendDirection,
    days,
  });

  return {
    hasData: true,
    currentRiskLevel,
    daysAtCurrentLevel,
    lastEscalation,
    lastDeescalation: null, // V1: risk drops not tracked as separate snapshots
    trendDirection,
    formattedSummary,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyContext(): SignalTrendContext {
  return {
    hasData: false,
    currentRiskLevel: null,
    daysAtCurrentLevel: null,
    lastEscalation: null,
    lastDeescalation: null,
    trendDirection: "UNKNOWN",
    formattedSummary: null,
  };
}

function resolveLastEscalation(
  snapshots: ExecutiveSignalSnapshot[],
  todayDate: string,
): EscalationRecord | null {
  const escalations = snapshots
    .filter((s) => s.snapshotType === "RISK_ESCALATION" && s.escalationFrom && s.escalationTo)
    .sort((a, b) => {
      const dateCompare = b.snapshotDate.localeCompare(a.snapshotDate);
      if (dateCompare !== 0) return dateCompare;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

  if (escalations.length === 0) return null;

  const latest = escalations[0];
  return {
    from: latest.escalationFrom!,
    to: latest.escalationTo!,
    date: latest.snapshotDate,
    daysAgo: daysBetween(latest.snapshotDate, todayDate),
  };
}

function computeTrendDirection(
  sortedDates: string[],
  byDate: Map<string, string>,
): TrendDirection {
  if (sortedDates.length < 2) return "UNKNOWN";

  const recentDates = sortedDates.slice(-3);
  const recentRanks = recentDates.map((d) => RISK_RANK[byDate.get(d)!] ?? 0);

  if (recentRanks.length < 2) return "UNKNOWN";

  const hasIncrease = recentRanks.some((v, i) => i > 0 && v > recentRanks[i - 1]);
  const hasDecrease = recentRanks.some((v, i) => i > 0 && v < recentRanks[i - 1]);

  if (hasIncrease && !hasDecrease) return "RISING";
  if (hasDecrease && !hasIncrease) return "DECLINING";
  if (!hasIncrease && !hasDecrease) return "STABLE";
  return "STABLE"; // mixed signals → stable for AI context
}

function buildFormattedSummary(input: {
  currentRiskLevel: string;
  daysAtCurrentLevel: number;
  lastEscalation: EscalationRecord | null;
  trendDirection: TrendDirection;
  days: number;
}): string {
  const lines: string[] = [
    "Risk trendi:",
    `Son durum: ${RISK_LABEL[input.currentRiskLevel] ?? input.currentRiskLevel}`,
    `Bu seviyede: ${input.daysAtCurrentLevel} gündür`,
  ];

  if (input.lastEscalation) {
    const fromLabel = RISK_LABEL[input.lastEscalation.from] ?? input.lastEscalation.from;
    const toLabel = RISK_LABEL[input.lastEscalation.to] ?? input.lastEscalation.to;
    const daysAgo = input.lastEscalation.daysAgo;
    const daysAgoText =
      daysAgo === 0 ? "bugün" : daysAgo === 1 ? "1 gün önce" : `${daysAgo} gün önce`;
    lines.push(`Son yükseliş: ${fromLabel} → ${toLabel}, ${daysAgoText}`);
  }

  lines.push(`${input.days} günlük görünüm: ${TREND_LABEL[input.trendDirection]}`);

  return lines.join("\n");
}

function daysBetween(dateA: string, dateB: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.max(0, Math.round(Math.abs(b - a) / msPerDay));
}

function currentDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
