import type { MemoryContext } from "@/lib/memory/memory-context.types";
import type { ManagerAdviceAugmentationContext } from "@/lib/manager-advice/manager-advice-augmentation.types";
import type { ExecutiveBrainShadowMetadata } from "@/lib/executive-brain/executive-brain.types";
import type {
  ExecutiveConstitutionContext,
  ExecutiveCouncilActivation,
} from "@/lib/executive-constitution/executive-constitution.types";
import type { PromptTemplateId } from "./prompts/prompt.types";
import type {
  AiProviderName,
  AiProviderUsage,
} from "./providers/ai-provider";
import type { CollectionActionContext } from "@/lib/core/collection-actions/collection-action-context-builder";
import type { QuoteContext } from "@/lib/core/quotes/quote-context-builder";
import type { ExecutiveConversationState } from "@/lib/ai/executive-conversation.types";
import type { LearningLoopResult } from "@/lib/learning-loop/learning-loop-orchestrator.types";
import type { ExecutiveDecisionContext } from "@/lib/executive-decision-loop/executive-decision-loop.types";
import type { ExecutiveLearningDecision } from "@/lib/executive-learning-orchestrator";
import type { ExecutiveLearningResolverDecision } from "@/lib/executive-learning-resolver";
import type { ConversationSnapshot } from "@/lib/executive-conversation-opportunity";
import type { OrganizationRole } from "@prisma/client";
import type { ExecutiveOperatingSystem } from "@/lib/executive-operating-system";
import type { ConversationPresenceSignal } from "./prompts/conversation-presence.types";
import type { ExecutivePresenceSurface } from "./identity/executive-identity-prompt";
import type {
  ExecutiveBehaviorPlanV1,
  LivingExecutiveSemanticHint,
} from "./living-executive-presence";
import type { ExecutiveManagementPictureV1 } from "@/lib/executive-management-picture";
import type { ExecutiveAssessmentV1 } from "@/lib/executive-assessment";
import type { ExecutiveDirectiveV1 } from "@/lib/ai/executive-directive";

export type GenerateAiResponseInput = {
  requestId?: string;
  correlationId?: string;
  turnId?: string;
  channel?: "voice" | "text";
  contextProfile?:
    | "immediate_minimal"
    | "conversational_minimal"
    | "business_light"
    | "executive_analysis"
    | "action_execution"
    | "full_context";
  organizationId: string;
  conversationId: string;
  userMessage: string;
  behaviorSurface?: ExecutivePresenceSurface;
  livingBehaviorHint?: LivingExecutiveSemanticHint | null;
  executiveBehaviorPlan?: ExecutiveBehaviorPlanV1 | null;
  executiveManagementPicture?: ExecutiveManagementPictureV1 | null;
  executiveAssessment?: ExecutiveAssessmentV1 | null;
  executiveDirective?: ExecutiveDirectiveV1 | null;
  onExecutiveConversationGuidanceObserved?: (guidance: string | null) => void;
  provider?: AiProviderName;
  promptTemplateId?: PromptTemplateId;
  organizationSummary?: string | null;
  preloadedMemoryContext?: MemoryContext | null;
  managerAdviceAugmentationContext?: ManagerAdviceAugmentationContext | null;
  executiveBrainContext?: ExecutiveBrainShadowMetadata | null;
  executiveConstitutionContext?: ExecutiveConstitutionContext | null;
  executiveCouncilActivation?: ExecutiveCouncilActivation | null;
  previousConversationState?: ExecutiveConversationState | null;
  learningLoop?: LearningLoopResult | null;
  learningDecision?: ExecutiveLearningDecision | null;
  learningSnapshot?: ConversationSnapshot | null;
  currentUserId?: string | null;
  currentUserName?: string | null;
  organizationMembershipRole?: OrganizationRole | null;
  executiveOperatingSystem?: ExecutiveOperatingSystem | null;
  conversationPresence?: ConversationPresenceSignal | null;
  requiresExecutiveReasoning?: boolean;
};

export type AiCostTrackingMetadata = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number | null;
  currency: "USD";
};

export type GenerateAiResponseResult = {
  content: string;
  model: string;
  provider: AiProviderName;
  conversationId: string;
  memoryContext: MemoryContext;
  collectionActionContext: CollectionActionContext;
  quoteContext: QuoteContext;
  systemPrompt: string;
  promptTemplate: {
    id: PromptTemplateId;
    version: string;
  };
  usage?: AiProviderUsage;
  costTracking?: AiCostTrackingMetadata;
  rawResponseId?: string;
  conversationState?: ExecutiveConversationState | null;
  executiveDecisionContext?: ExecutiveDecisionContext | null;
  resolverDecision?: ExecutiveLearningResolverDecision | null;
  // Present only when the gateway deferred the Executive Operating Context's
  // write-policy side effects (collection action sync, signal snapshot,
  // decision records, priority action sync) instead of running them inline.
  // The caller is expected to invoke this once the response has been sent.
  runDeferredOperatingContextWrites?: () => Promise<void>;
};
