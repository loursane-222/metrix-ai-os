export type TrendDirection = "RISING" | "STABLE" | "DECLINING" | "UNKNOWN";

export type EscalationRecord = {
  from: string;
  to: string;
  date: string;
  daysAgo: number;
};

export type SignalTrendContext = {
  hasData: boolean;
  currentRiskLevel: string | null;
  daysAtCurrentLevel: number | null;
  lastEscalation: EscalationRecord | null;
  lastDeescalation: EscalationRecord | null;
  trendDirection: TrendDirection;
  formattedSummary: string | null;
};
