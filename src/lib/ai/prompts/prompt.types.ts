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
import type { ExecutiveFollowUpPromptSummary } from "@/lib/executive-follow-up-intelligence";
import type { ExecutiveLearningDecision } from "@/lib/executive-learning-orchestrator";
import type { ExecutiveGoalIntelligence } from "@/lib/executive-goal-intelligence";
import type { ExecutiveLearningResolverDecision } from "@/lib/executive-learning-resolver";
import type { ExecutiveOperatingSystem } from "@/lib/executive-operating-system";
import type { ConversationPresenceSignal } from "./conversation-presence.types";
import type { GmailRetrievalContext } from "@/lib/integrations/gmail/gmail.types";
import type { ExecutivePresenceSurface } from "@/lib/ai/identity/executive-identity-prompt";
import type {
  ExecutiveBehaviorPlanV1,
  LivingExecutiveSemanticHint,
} from "@/lib/ai/living-executive-presence";
import type { ExecutiveManagementPictureV1 } from "@/lib/executive-management-picture";
import type { ExecutiveAssessmentV1 } from "@/lib/executive-assessment";
import type { ExecutiveDirectiveV1 } from "@/lib/ai/executive-directive";

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
  userMessage?: string;
  behaviorSurface?: ExecutivePresenceSurface;
  livingBehaviorHint?: LivingExecutiveSemanticHint | null;
  executiveBehaviorPlan?: ExecutiveBehaviorPlanV1 | null;
  executiveManagementPicture?: ExecutiveManagementPictureV1 | null;
  executiveAssessment?: ExecutiveAssessmentV1 | null;
  executiveDirective?: ExecutiveDirectiveV1 | null;
  executiveConversationGuidance?: string | null;
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
  goalIntelligence?: ExecutiveGoalIntelligence | null;
  executiveOperatingSystem?: ExecutiveOperatingSystem | null;
  conversationPresence?: ConversationPresenceSignal | null;
  gmailContext?: GmailRetrievalContext | null;
  requiresExecutiveReasoning?: boolean;
  /**
   * Non-canonical surface compatibility. Canonical /api/ai/chat serializes
   * only the versioned Executive artefacts above.
   */
  executiveFollowUpIntelligence?: ExecutiveFollowUpPromptSummary | null;
};

export type PromptRenderInput = {
  userMessage?: string;
  behaviorSurface?: ExecutivePresenceSurface;
  livingBehaviorHint?: LivingExecutiveSemanticHint | null;
  executiveBehaviorPlan?: ExecutiveBehaviorPlanV1 | null;
  executiveManagementPicture?: ExecutiveManagementPictureV1 | null;
  executiveAssessment?: ExecutiveAssessmentV1 | null;
  executiveDirective?: ExecutiveDirectiveV1 | null;
  executiveConversationGuidance?: string | null;
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
  goalIntelligence?: ExecutiveGoalIntelligence | null;
  executiveOperatingSystem?: ExecutiveOperatingSystem | null;
  conversationPresence?: ConversationPresenceSignal | null;
  gmailContext?: GmailRetrievalContext | null;
  requiresExecutiveReasoning?: boolean;
  executiveFollowUpIntelligence?: ExecutiveFollowUpPromptSummary | null;
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
