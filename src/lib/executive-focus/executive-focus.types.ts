import type { ExecutiveAlertBundle } from "@/lib/executive-alerts/executive-alert.types";
import type { ExecutiveAwareness } from "@/lib/executive-awareness";
import type { ExecutiveDecisionContext } from "@/lib/executive-decision-loop";
import type { ExecutiveForecast } from "@/lib/executive-forecasting/executive-forecasting.types";
import type { ExecutiveNarrative } from "@/lib/executive-narrative";
import type { ExecutiveRhythm } from "@/lib/executive-rhythm/executive-rhythm.types";
import type { ExecutiveScorecard } from "@/lib/executive-scorecard";
import type { SignalTrendContext } from "@/lib/signal-persistence/signal-trend-context.types";

export type ExecutiveFocusArea =
  | "CASH"
  | "COLLECTION"
  | "SALES"
  | "EXECUTION"
  | "DECISION_FOLLOW_UP"
  | "MARKET"
  | "DATA_QUALITY"
  | "GENERAL_CONTROL";

export type ExecutiveFocusLevel =
  | "NORMAL"
  | "WATCH"
  | "IMPORTANT"
  | "URGENT"
  | "BLOCKED";

export type ExecutiveFocusConfidence = "LOW" | "MEDIUM" | "HIGH";

export type ExecutiveFocusItem = {
  focusArea: ExecutiveFocusArea;
  focusLevel: ExecutiveFocusLevel;
  reason: string;
  firstMove: string;
  sourceSignals: string[];
  confidence: ExecutiveFocusConfidence;
};

export type ExecutiveFocus = {
  generatedAt: string;
  primaryFocus: ExecutiveFocusItem;
  secondaryFocus: ExecutiveFocusItem | null;
  watchOnly: ExecutiveFocusArea[];
  deferredAreas: string[];
  focusSummary: string;
  managementInstruction: string;
  confidence: ExecutiveFocusConfidence;
  evidence: string[];
};

export type BuildExecutiveFocusInput = {
  organizationId: string;
  executiveAwareness?: ExecutiveAwareness | null;
  executiveScorecard?: ExecutiveScorecard | null;
  executiveNarrative?: ExecutiveNarrative | null;
  executiveRhythm?: ExecutiveRhythm | null;
  executiveDecisionContext?: ExecutiveDecisionContext | null;
  executiveAlerts?: ExecutiveAlertBundle | null;
  executiveForecast?: ExecutiveForecast | null;
  signalTrendContext?: SignalTrendContext | null;
  failedSteps?: string[];
};
