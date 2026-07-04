import type { ExecutiveAlertBundle } from "@/lib/executive-alerts/executive-alert.types";
import type { ExecutiveForecast } from "@/lib/executive-forecasting/executive-forecasting.types";
import type { BriefingPackage } from "@/lib/daily-briefing/daily-briefing.types";
import type {
  ExecutiveConversationState,
  CommitmentOutcome,
} from "@/lib/ai/executive-conversation.types";
import type { QuoteIntelligence } from "@/lib/core/quotes/quote-intelligence-builder";
import type { PaymentIntelligence } from "@/lib/core/payments/payment-intelligence-builder";
import type { ExecutiveDecisionContext } from "@/lib/executive-decision-loop/executive-decision-loop.types";

export type PriorityUrgency = "TODAY" | "THIS_WEEK";

export type PrioritySource =
  | "alert"
  | "forecast"
  | "briefing"
  | "commitment"
  | "decision"
  | "quote"
  | "payment";

export type FocusArea =
  | "COLLECTION"
  | "SALES"
  | "CASH"
  | "MARKET"
  | "FOLLOW_UP";

export type DailyPriority = {
  rank: 1 | 2 | 3;
  focus: string;
  headline: string;
  actionHint: string | null;
  urgency: PriorityUrgency;
  source: PrioritySource;
  focusArea: FocusArea;
};

export type ExecutiveCheckpoint = {
  hasActiveCommitment: boolean;
  committedTitle: string | null;
  isFollowUpDue: boolean;
  followUpDueAt: string | null;
  commitmentOutcome: CommitmentOutcome | null;
};

export type ExecutiveRhythm = {
  organizationId: string;
  generatedAt: string;
  priorities: DailyPriority[];
  primaryFocusArea: FocusArea | null;
  checkpoint: ExecutiveCheckpoint;
  hasPriorities: boolean;
};

export type BuildExecutiveRhythmInput = {
  organizationId: string;
  executiveAlerts?: ExecutiveAlertBundle | null;
  executiveForecast?: ExecutiveForecast | null;
  latestBriefing?: BriefingPackage | null;
  conversationState?: ExecutiveConversationState | null;
  decisionContext?: ExecutiveDecisionContext | null;
  quoteIntelligence?: QuoteIntelligence | null;
  paymentIntelligence?: PaymentIntelligence | null;
};
