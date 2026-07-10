import type { MemoryContext } from "@/lib/memory/memory-context.types";
import type { ManagerAdviceAugmentationContext } from "@/lib/manager-advice/manager-advice-augmentation.types";
import type { ExecutiveBrainShadowMetadata } from "@/lib/executive-brain/executive-brain.types";
import type {
  ExecutiveConstitutionContext,
  ExecutiveCouncilActivation,
} from "@/lib/executive-constitution/executive-constitution.types";
import type { QuoteContext } from "@/lib/core/quotes/quote-context-builder";
import type { QuoteIntelligence } from "@/lib/core/quotes/quote-intelligence-builder";
import type { PaymentContext } from "@/lib/core/payments/payment-context-builder";
import type { PaymentIntelligence } from "@/lib/core/payments/payment-intelligence-builder";
import type { CollectionActionContext } from "@/lib/core/collection-actions/collection-action-context-builder";
import type {
  ExecutiveRecommendationPackage,
  ExecutiveConversationState,
} from "@/lib/ai/executive-conversation.types";
import type { BriefingPackage } from "@/lib/daily-briefing/daily-briefing.types";
import type { ExecutiveForecast } from "@/lib/executive-forecasting/executive-forecasting.types";
import type { ExecutiveAlertBundle } from "@/lib/executive-alerts/executive-alert.types";
import type { ExecutiveRhythm } from "@/lib/executive-rhythm/executive-rhythm.types";
import type { LearningLoopResult } from "@/lib/learning-loop/learning-loop-orchestrator.types";
import type { SignalTrendContext } from "@/lib/signal-persistence/signal-trend-context.types";
import type { ExecutiveDecisionContext } from "@/lib/executive-decision-loop/executive-decision-loop.types";
import type { ExecutiveManagerContext } from "@/lib/executive-prompt-bridge";
import type { ExecutiveLearningDecision } from "@/lib/executive-learning-orchestrator";
import type { ExecutiveGoalIntelligence } from "@/lib/executive-goal-intelligence";
import type { ExecutiveLearningResolverDecision } from "@/lib/executive-learning-resolver";
import type { ExecutiveOperatingSystem } from "@/lib/executive-operating-system";
import type { ConversationPresenceSignal } from "./conversation-presence.types";

export type PromptTemplateId =
  | "onboarding_assistant"
  | "general_conversation"
  | "voice_conversation"
  | "memory_extraction";

export type PersonContextItem = {
  type: string;
  fullName: string;
  title?: string | null;
  notes?: string | null;
};

export type BuildSystemPromptInput = {
  organizationSummary?: string | null;
  memoryContext: MemoryContext;
  personContext?: PersonContextItem[] | null;
  quoteContext?: QuoteContext | null;
  quoteIntelligence?: QuoteIntelligence | null;
  paymentContext?: PaymentContext | null;
  paymentIntelligence?: PaymentIntelligence | null;
  collectionActionContext?: CollectionActionContext | null;
  templateId?: PromptTemplateId;
  managerAdviceAugmentationContext?: ManagerAdviceAugmentationContext | null;
  executiveBrainContext?: ExecutiveBrainShadowMetadata | null;
  executiveConstitutionContext?: ExecutiveConstitutionContext | null;
  executiveCouncilActivation?: ExecutiveCouncilActivation | null;
  recommendationPackage?: ExecutiveRecommendationPackage | null;
  conversationState?: ExecutiveConversationState | null;
  briefingContext?: BriefingPackage | null;
  executiveForecast?: ExecutiveForecast | null;
  executiveAlerts?: ExecutiveAlertBundle | null;
  executiveRhythm?: ExecutiveRhythm | null;
  executiveDecisionContext?: ExecutiveDecisionContext | null;
  learningLoop?: LearningLoopResult | null;
  learningDecision?: ExecutiveLearningDecision | null;
  resolverDecision?: ExecutiveLearningResolverDecision | null;
  signalTrendContext?: SignalTrendContext | null;
  executiveManagerContext?: ExecutiveManagerContext | null;
  goalIntelligence?: ExecutiveGoalIntelligence | null;
  executiveOperatingSystem?: ExecutiveOperatingSystem | null;
  conversationPresence?: ConversationPresenceSignal | null;
  requiresExecutiveReasoning?: boolean;
};

export type PromptRenderInput = {
  organizationSummary?: string | null;
  memoryContext: MemoryContext;
  personContext?: PersonContextItem[] | null;
  quoteContext?: QuoteContext | null;
  quoteIntelligence?: QuoteIntelligence | null;
  paymentContext?: PaymentContext | null;
  paymentIntelligence?: PaymentIntelligence | null;
  collectionActionContext?: CollectionActionContext | null;
  managerAdviceAugmentationContext?: ManagerAdviceAugmentationContext | null;
  executiveBrainContext?: ExecutiveBrainShadowMetadata | null;
  executiveConstitutionContext?: ExecutiveConstitutionContext | null;
  executiveCouncilActivation?: ExecutiveCouncilActivation | null;
  recommendationPackage?: ExecutiveRecommendationPackage | null;
  conversationState?: ExecutiveConversationState | null;
  briefingContext?: BriefingPackage | null;
  executiveForecast?: ExecutiveForecast | null;
  executiveAlerts?: ExecutiveAlertBundle | null;
  executiveRhythm?: ExecutiveRhythm | null;
  executiveDecisionContext?: ExecutiveDecisionContext | null;
  learningLoop?: LearningLoopResult | null;
  learningDecision?: ExecutiveLearningDecision | null;
  resolverDecision?: ExecutiveLearningResolverDecision | null;
  signalTrendContext?: SignalTrendContext | null;
  executiveManagerContext?: ExecutiveManagerContext | null;
  goalIntelligence?: ExecutiveGoalIntelligence | null;
  executiveOperatingSystem?: ExecutiveOperatingSystem | null;
  conversationPresence?: ConversationPresenceSignal | null;
  requiresExecutiveReasoning?: boolean;
};

export type PromptTemplate = {
  id: PromptTemplateId;
  version: string;
  description: string;
  render(input: PromptRenderInput): string;
};

export type RenderedPrompt = {
  templateId: PromptTemplateId;
  templateVersion: string;
  systemPrompt: string;
};
