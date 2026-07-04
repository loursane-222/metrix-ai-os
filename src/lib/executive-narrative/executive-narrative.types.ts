import type { ExecutiveAlertBundle } from "@/lib/executive-alerts/executive-alert.types";
import type { ExecutiveAwareness } from "@/lib/executive-awareness";
import type { ExecutiveDecisionContext } from "@/lib/executive-decision-loop";
import type { ExecutiveForecast } from "@/lib/executive-forecasting/executive-forecasting.types";
import type { ExecutiveRhythm } from "@/lib/executive-rhythm/executive-rhythm.types";
import type { ExecutiveScorecard } from "@/lib/executive-scorecard";
import type { BriefingPackage } from "@/lib/daily-briefing/daily-briefing.types";
import type { SignalTrendContext } from "@/lib/signal-persistence/signal-trend-context.types";

export type ExecutiveNarrativeTone =
  | "CALM"
  | "DIRECT"
  | "URGENT"
  | "CAUTIOUS";

export type ExecutiveNarrativePosture =
  | "NORMAL"
  | "WATCHFUL"
  | "PRESSURE"
  | "CRITICAL"
  | "UNCERTAIN";

export type ExecutiveNarrative = {
  generatedAt: string;
  tone: ExecutiveNarrativeTone;
  posture: ExecutiveNarrativePosture;
  openingLine: string;
  executiveSummary: string;
  managementMeaning: string;
  firstAttention: string | null;
  riskLanguage: string | null;
  dataQualityLanguage: string | null;
  briefingNarrative: string;
  promptNarrative: string;
  evidence: string[];
};

export type BuildExecutiveNarrativeInput = {
  organizationId: string;
  executiveAwareness?: ExecutiveAwareness | null;
  executiveScorecard?: ExecutiveScorecard | null;
  executiveRhythm?: ExecutiveRhythm | null;
  executiveDecisionContext?: ExecutiveDecisionContext | null;
  executiveAlerts?: ExecutiveAlertBundle | null;
  executiveForecast?: ExecutiveForecast | null;
  signalTrendContext?: SignalTrendContext | null;
  latestBriefing?: BriefingPackage | null;
  failedSteps?: string[];
};
