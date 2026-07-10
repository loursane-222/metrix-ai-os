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
import type { ExecutiveDecisionResult } from "@/lib/executive-decision-engine";
import type { ExecutiveDelegationResult } from "@/lib/executive-delegation";
import type { ExecutiveResponsibilityMatrixResult } from "@/lib/executive-responsibility-matrix";
import type { ExecutivePerformanceSignalResult } from "@/lib/executive-performance-signal";
import type { ExecutiveManagementReviewResult } from "@/lib/executive-management-review";
import type { ConversationSnapshot } from "@/lib/executive-conversation-opportunity";
import type { OrganizationRole } from "@prisma/client";
import type { ExecutiveOperatingSystem } from "@/lib/executive-operating-system";
import type { ConversationPresenceSignal } from "./prompts/conversation-presence.types";

export type GenerateAiResponseInput = {
  organizationId: string;
  conversationId: string;
  userMessage: string;
  provider?: AiProviderName;
  promptTemplateId?: PromptTemplateId;
  organizationSummary?: string | null;
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
  executiveDecisionResult?: ExecutiveDecisionResult | null;
  executiveDelegationResult?: ExecutiveDelegationResult | null;
  executiveResponsibilityMatrixResult?: ExecutiveResponsibilityMatrixResult | null;
  executivePerformanceSignalResult?: ExecutivePerformanceSignalResult | null;
  executiveManagementReviewResult?: ExecutiveManagementReviewResult | null;
};
