import { buildCostTrackingMetadata } from "@/lib/ai/gateway/cost-tracker";
import { renderPromptTemplate } from "@/lib/ai/prompts/prompt-renderer";
import { getAiProvider } from "@/lib/ai/providers/provider-registry";
import { createOpenAiStream } from "@/lib/ai/providers/openai-provider";
import type { OpenAiStreamHandle } from "@/lib/ai/providers/openai-provider";
import { detectExecutiveObjection } from "@/lib/executive-conversation/executive-recommendation-detector.service";
import {
  buildExecutiveRecommendationPackage,
  buildRecommendationPackageFromNextMove,
} from "@/lib/executive-conversation/executive-recommendation-engine.service";
import { detectConversationSignal } from "@/lib/executive-conversation/executive-conversation-detector.service";
import { buildExecutiveConversationState } from "@/lib/executive-conversation/executive-conversation-engine.service";
import { detectCommitmentOutcome } from "@/lib/executive-conversation/executive-commitment-detector.service";
import { buildExecutiveOperatingContext } from "@/lib/executive-operating-context";
import { buildExecutivePromptBridge } from "@/lib/executive-prompt-bridge";
import { buildGoalLearningDecision } from "@/lib/executive-goal-learning";
import { buildLearningResolverDecision } from "@/lib/executive-learning-resolver";
import { buildExecutiveDecisionResult } from "@/lib/executive-decision-engine";
import {
  buildExecutiveDelegationPromptSummary,
  buildExecutiveDelegationResult,
} from "@/lib/executive-delegation";
import {
  buildExecutiveResponsibilityMatrix,
  buildExecutiveResponsibilityMatrixPromptSummary,
} from "@/lib/executive-responsibility-matrix";
import {
  buildExecutivePerformanceSignalPromptSummary,
  buildExecutivePerformanceSignalResult,
} from "@/lib/executive-performance-signal";
import {
  buildExecutiveManagementReviewPromptSummary,
  buildExecutiveManagementReviewResult,
} from "@/lib/executive-management-review";
import { buildCustomerPortfolioPromptSummary } from "@/lib/customer-portfolio-intelligence";
import { buildCustomerHealthPromptSummary } from "@/lib/customer-health-intelligence";

import type { AiProviderName, AiProviderUsage } from "@/lib/ai/providers/ai-provider";
import type {
  AiGatewayGenerateInput,
  AiGatewayGenerateResult,
} from "./ai-gateway.types";
import { createRequestProfiler } from "@/lib/ai/performance/request-profiler";

export type AiGatewayStreamPre = Omit<
  AiGatewayGenerateResult,
  "content" | "model" | "provider" | "usage" | "costTracking" | "rawResponseId"
>;

export type AiGatewayStreamHandle = {
  pre: AiGatewayStreamPre;
  textStream: AsyncGenerator<string, void, unknown>;
  getFinalMeta: () => Promise<{
    model: string;
    provider: AiProviderName;
    usage: AiProviderUsage | undefined;
    rawResponseId: string;
    content: string;
  }>;
};

const CHAT_STRICT_CONTEXT_STEPS = [
  "memoryContext",
  "personContext",
  "quoteContext",
  "paymentContext",
  "quoteConversionContext",
  "todayAnchorSnapshot",
  "recentSignalSnapshots",
  "syncCollectionActions",
  "collectionActionContext",
];

export async function generateWithAiGateway(
  input: AiGatewayGenerateInput,
): Promise<AiGatewayGenerateResult> {
  const gwProfiler = createRequestProfiler("chat_gateway");
  const providerName = resolveProviderName(input.provider);
  const templateId = input.promptTemplateId ?? "general_conversation";
  const executiveBrainContext = input.executiveBrainContext;
  const objectionSignal = detectExecutiveObjection(input.userMessage);
  const conversationSignal = detectConversationSignal(input.userMessage);
  const outcomeSignal = detectCommitmentOutcome(input.userMessage, input.previousConversationState?.phase ?? null);

  let recommendationPackage = null;
  let conversationState = null;
  gwProfiler.markStart("operating_context");
  const operatingContext = await buildExecutiveOperatingContext({
    organizationId: input.organizationId,
    mode: "CHAT",
    conversationId: input.conversationId,
    executiveBrainContext,
    strictSteps: CHAT_STRICT_CONTEXT_STEPS,
    currentUserId: input.currentUserId,
    currentUserName: input.currentUserName,
    organizationMembershipRole: input.organizationMembershipRole,
    writePolicy: {
      syncCollectionActions: true,
      writeSignalSnapshot: true,
      writeDecisionRecords: true,
    },
    resolveRuntimeAugmentation: ({ quoteIntelligence, quoteConversionContext }) => {
      const eosNextMove = input.executiveOperatingSystem?.recommendedNextMove ?? null;

      if (!eosNextMove && executiveBrainContext?.mode === "shadow" && !quoteIntelligence) {
        throw new Error("Quote intelligence is required for executive recommendation package.");
      }

      if (eosNextMove) {
        recommendationPackage = buildRecommendationPackageFromNextMove({
          recommendedNextMove: eosNextMove,
          objection: objectionSignal,
          quoteIntelligence: quoteIntelligence ?? null,
          conversionIntelligence: quoteConversionContext
            ? quoteIntelligence?.conversionIntelligence ?? null
            : null,
        });
      } else if (executiveBrainContext?.mode === "shadow") {
        recommendationPackage = buildExecutiveRecommendationPackage({
          decisionPackage: executiveBrainContext.decisionPackage,
          objection: objectionSignal,
          quoteIntelligence: quoteIntelligence!,
          conversionIntelligence: quoteConversionContext
            ? quoteIntelligence!.conversionIntelligence
            : null,
        });
      } else {
        recommendationPackage = null;
      }

      conversationState = buildExecutiveConversationState({
        previousState: input.previousConversationState ?? null,
        conversationSignal,
        objectionSignal,
        outcomeSignal,
        recommendationPackage,
      });

      return { recommendationPackage, conversationState };
    },
  });

  gwProfiler.markEnd("operating_context");

  if (!operatingContext.memoryContext || !operatingContext.quoteContext || !operatingContext.paymentContext || !operatingContext.collectionActionContext) {
    throw new Error("Required AI gateway operating context could not be built.");
  }

  gwProfiler.markStart("sync_intelligence_build");
  const goalLearningDecision =
    operatingContext.goalIntelligence != null && input.learningSnapshot != null
      ? buildGoalLearningDecision({
          goalIntelligence: operatingContext.goalIntelligence,
          snapshot: input.learningSnapshot,
        })
      : null;

  const resolverDecision = buildLearningResolverDecision({
    knowledgeLearningDecision: input.learningDecision ?? null,
    goalLearningDecision,
  });

  const executiveDecisionResult = buildExecutiveDecisionResult({
    operatingContext,
    resolverDecision,
  });
  const executiveDelegationResult = buildExecutiveDelegationResult({
    operatingContext,
    executiveDecisionResult,
    currentUserName: input.currentUserName,
    organizationMembershipRole: input.organizationMembershipRole,
  });
  const executiveDelegationPromptSummary =
    buildExecutiveDelegationPromptSummary(executiveDelegationResult);
  const executiveResponsibilityMatrixResult = buildExecutiveResponsibilityMatrix({
    operatingContext,
    executiveDecisionResult,
    executiveDelegationResult,
  });
  const executiveResponsibilityMatrixPromptSummary =
    buildExecutiveResponsibilityMatrixPromptSummary(executiveResponsibilityMatrixResult);
  const executivePerformanceSignalResult = buildExecutivePerformanceSignalResult({
    operatingContext,
    executiveDecisionResult,
    executiveDelegationResult,
    executiveResponsibilityMatrixResult,
    outcomeAggregate: operatingContext.executiveDecisionContext?.outcomeAggregate ?? null,
  });
  const executivePerformanceSignalPromptSummary =
    buildExecutivePerformanceSignalPromptSummary(executivePerformanceSignalResult);
  const executiveManagementReviewResult = buildExecutiveManagementReviewResult({
    operatingContext,
    executiveDecisionResult,
    executivePerformanceSignalResult,
    executiveResponsibilityMatrixResult,
    companyPerformanceSignal: operatingContext.companyPerformanceSignal ?? null,
    outcomeAggregate: operatingContext.executiveDecisionContext?.outcomeAggregate ?? null,
  });
  const executiveManagementReviewPromptSummary =
    buildExecutiveManagementReviewPromptSummary(executiveManagementReviewResult);

  const customerPortfolioPromptSummary = operatingContext.customerPortfolioIntelligence
    ? buildCustomerPortfolioPromptSummary(operatingContext.customerPortfolioIntelligence)
    : null;

  const customerHealthPromptSummary = operatingContext.customerHealthIntelligence
    ? buildCustomerHealthPromptSummary(operatingContext.customerHealthIntelligence)
    : null;

  const executiveManagerContext = buildExecutivePromptBridge({
    organizationId: input.organizationId,
    executiveAwareness: operatingContext.executiveAwareness,
    executiveScorecard: operatingContext.executiveScorecard,
    executiveNarrative: operatingContext.executiveNarrative,
    executiveFocus: operatingContext.executiveFocus,
    executiveForecast: operatingContext.executiveForecast,
    executiveAlerts: operatingContext.executiveAlerts,
    executiveDecisionContext: operatingContext.executiveDecisionContext,
    executiveRhythm: operatingContext.executiveRhythm,
    paymentContext: operatingContext.paymentContext,
    paymentIntelligence: operatingContext.paymentIntelligence,
    quoteContext: operatingContext.quoteContext,
    quoteIntelligence: operatingContext.quoteIntelligence,
    collectionActionContext: operatingContext.collectionActionContext,
    latestBriefing: operatingContext.latestBriefing?.briefingPackage ?? null,
    signalTrendContext: operatingContext.signal.trendContext,
    failedSteps: operatingContext.diagnostics.failedSteps,
    goalIntelligence: operatingContext.goalIntelligence ?? null,
    executiveDecision: executiveDecisionResult.promptSummary,
    executiveDecisionFollowUp: operatingContext.executiveDecisionFollowUp?.promptSummary ?? null,
    executiveAccountability: operatingContext.executiveAccountability?.promptSummary ?? null,
    executiveDelegation: executiveDelegationPromptSummary,
    executiveResponsibilityMatrix: executiveResponsibilityMatrixPromptSummary,
    executivePerformanceSignal: executivePerformanceSignalPromptSummary,
    executiveManagementReview: executiveManagementReviewPromptSummary,
    customerPortfolio: customerPortfolioPromptSummary,
    customerHealth: customerHealthPromptSummary,
    expenseContext: operatingContext.expenseContext,
    expenseIntelligence: operatingContext.expenseIntelligence,
    financialHealthIntelligence: operatingContext.financialHealthIntelligence,
    companyPerformanceSignal: operatingContext.companyPerformanceSignal ?? null,
    executivePriority: operatingContext.executivePriority,
    executiveOperatingRhythm: operatingContext.executiveOperatingRhythm,
    executiveFollowUpIntelligence: operatingContext.executiveFollowUpIntelligence?.promptSummary ?? null,
  });

  gwProfiler.markEnd("sync_intelligence_build");
  // PERF: coarse timing boundary — prompt_build includes string assembly only (no I/O)
  gwProfiler.markStart("prompt_build");
  const renderedPrompt = renderPromptTemplate({
    templateId,
    organizationSummary: input.organizationSummary,
    memoryContext: operatingContext.memoryContext,
    personContext: operatingContext.personContext,
    quoteContext: operatingContext.quoteContext,
    quoteIntelligence: operatingContext.quoteIntelligence,
    paymentContext: operatingContext.paymentContext,
    paymentIntelligence: operatingContext.paymentIntelligence,
    collectionActionContext: operatingContext.collectionActionContext,
    managerAdviceAugmentationContext:
      input.managerAdviceAugmentationContext,
    executiveBrainContext: input.executiveBrainContext,
    executiveConstitutionContext: input.executiveConstitutionContext,
    executiveCouncilActivation: input.executiveCouncilActivation,
    recommendationPackage,
    conversationState,
    briefingContext: operatingContext.latestBriefing?.briefingPackage ?? null,
    executiveForecast: operatingContext.executiveForecast,
    executiveAlerts: operatingContext.executiveAlerts,
    executiveRhythm: operatingContext.executiveRhythm,
    executiveDecisionContext: operatingContext.executiveDecisionContext,
    learningLoop: input.learningLoop ?? null,
    learningDecision: input.learningDecision ?? null,
    resolverDecision,
    signalTrendContext: operatingContext.signal.trendContext,
    executiveManagerContext,
    goalIntelligence: operatingContext.goalIntelligence ?? null,
    executiveOperatingSystem: input.executiveOperatingSystem ?? null,
  });
  gwProfiler.markEnd("prompt_build");
  const provider = getAiProvider(providerName);
  gwProfiler.markStart("openai_request");
  const response = await provider.generateResponse({
    systemPrompt: renderedPrompt.systemPrompt,
    userMessage: input.userMessage,
    context: operatingContext.memoryContext,
    metadata: {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    },
  });

  gwProfiler.markEnd("openai_request");
  gwProfiler.finish();

  return {
    content: response.content,
    model: response.model,
    provider: response.provider,
    conversationId: input.conversationId,
    memoryContext: operatingContext.memoryContext,
    collectionActionContext: operatingContext.collectionActionContext,
    quoteContext: operatingContext.quoteContext,
    systemPrompt: renderedPrompt.systemPrompt,
    promptTemplate: {
      id: renderedPrompt.templateId,
      version: renderedPrompt.templateVersion,
    },
    usage: response.usage,
    costTracking: buildCostTrackingMetadata(response.usage),
    rawResponseId: response.rawResponseId,
    conversationState,
    executiveDecisionContext: operatingContext.executiveDecisionContext,
    resolverDecision,
    executiveDecisionResult,
    executiveDelegationResult,
    executiveResponsibilityMatrixResult,
    executivePerformanceSignalResult,
    executiveManagementReviewResult,
  };
}

function resolveProviderName(provider?: AiProviderName): AiProviderName {
  if (provider) {
    return provider;
  }

  const configuredProvider = process.env.AI_PROVIDER?.trim().toLowerCase();

  if (configuredProvider === "openai" || configuredProvider === "mock") {
    return configuredProvider;
  }

  return "mock";
}

// ─── Streaming gateway ────────────────────────────────────────────────────────
// Same pre-processing as generateWithAiGateway; provider call replaced with stream.

export async function streamWithAiGateway(
  input: AiGatewayGenerateInput,
): Promise<AiGatewayStreamHandle> {
  const providerName = resolveProviderName(input.provider);
  const templateId = input.promptTemplateId ?? "general_conversation";
  const executiveBrainContext = input.executiveBrainContext;
  const objectionSignal = detectExecutiveObjection(input.userMessage);
  const conversationSignal = detectConversationSignal(input.userMessage);
  const outcomeSignal = detectCommitmentOutcome(
    input.userMessage,
    input.previousConversationState?.phase ?? null,
  );

  let recommendationPackage = null;
  let conversationState = null;

  const operatingContext = await buildExecutiveOperatingContext({
    organizationId: input.organizationId,
    mode: "CHAT",
    conversationId: input.conversationId,
    executiveBrainContext,
    strictSteps: CHAT_STRICT_CONTEXT_STEPS,
    currentUserId: input.currentUserId,
    currentUserName: input.currentUserName,
    organizationMembershipRole: input.organizationMembershipRole,
    writePolicy: {
      syncCollectionActions: true,
      writeSignalSnapshot: true,
      writeDecisionRecords: true,
    },
    resolveRuntimeAugmentation: ({ quoteIntelligence, quoteConversionContext }) => {
      const eosNextMove = input.executiveOperatingSystem?.recommendedNextMove ?? null;

      if (!eosNextMove && executiveBrainContext?.mode === "shadow" && !quoteIntelligence) {
        throw new Error("Quote intelligence is required for executive recommendation package.");
      }

      if (eosNextMove) {
        recommendationPackage = buildRecommendationPackageFromNextMove({
          recommendedNextMove: eosNextMove,
          objection: objectionSignal,
          quoteIntelligence: quoteIntelligence ?? null,
          conversionIntelligence: quoteConversionContext
            ? quoteIntelligence?.conversionIntelligence ?? null
            : null,
        });
      } else if (executiveBrainContext?.mode === "shadow") {
        recommendationPackage = buildExecutiveRecommendationPackage({
          decisionPackage: executiveBrainContext.decisionPackage,
          objection: objectionSignal,
          quoteIntelligence: quoteIntelligence!,
          conversionIntelligence: quoteConversionContext
            ? quoteIntelligence!.conversionIntelligence
            : null,
        });
      } else {
        recommendationPackage = null;
      }

      conversationState = buildExecutiveConversationState({
        previousState: input.previousConversationState ?? null,
        conversationSignal,
        objectionSignal,
        outcomeSignal,
        recommendationPackage,
      });

      return { recommendationPackage, conversationState };
    },
  });

  if (
    !operatingContext.memoryContext ||
    !operatingContext.quoteContext ||
    !operatingContext.paymentContext ||
    !operatingContext.collectionActionContext
  ) {
    throw new Error("Required AI gateway operating context could not be built.");
  }

  const goalLearningDecision =
    operatingContext.goalIntelligence != null && input.learningSnapshot != null
      ? buildGoalLearningDecision({
          goalIntelligence: operatingContext.goalIntelligence,
          snapshot: input.learningSnapshot,
        })
      : null;

  const resolverDecision = buildLearningResolverDecision({
    knowledgeLearningDecision: input.learningDecision ?? null,
    goalLearningDecision,
  });

  const executiveDecisionResult = buildExecutiveDecisionResult({
    operatingContext,
    resolverDecision,
  });
  const executiveDelegationResult = buildExecutiveDelegationResult({
    operatingContext,
    executiveDecisionResult,
    currentUserName: input.currentUserName,
    organizationMembershipRole: input.organizationMembershipRole,
  });
  const executiveDelegationPromptSummary =
    buildExecutiveDelegationPromptSummary(executiveDelegationResult);
  const executiveResponsibilityMatrixResult = buildExecutiveResponsibilityMatrix({
    operatingContext,
    executiveDecisionResult,
    executiveDelegationResult,
  });
  const executiveResponsibilityMatrixPromptSummary =
    buildExecutiveResponsibilityMatrixPromptSummary(executiveResponsibilityMatrixResult);
  const executivePerformanceSignalResult = buildExecutivePerformanceSignalResult({
    operatingContext,
    executiveDecisionResult,
    executiveDelegationResult,
    executiveResponsibilityMatrixResult,
    outcomeAggregate: operatingContext.executiveDecisionContext?.outcomeAggregate ?? null,
  });
  const executivePerformanceSignalPromptSummary =
    buildExecutivePerformanceSignalPromptSummary(executivePerformanceSignalResult);
  const executiveManagementReviewResult = buildExecutiveManagementReviewResult({
    operatingContext,
    executiveDecisionResult,
    executivePerformanceSignalResult,
    executiveResponsibilityMatrixResult,
    companyPerformanceSignal: operatingContext.companyPerformanceSignal ?? null,
    outcomeAggregate: operatingContext.executiveDecisionContext?.outcomeAggregate ?? null,
  });
  const executiveManagementReviewPromptSummary =
    buildExecutiveManagementReviewPromptSummary(executiveManagementReviewResult);

  const customerPortfolioPromptSummary = operatingContext.customerPortfolioIntelligence
    ? buildCustomerPortfolioPromptSummary(operatingContext.customerPortfolioIntelligence)
    : null;

  const customerHealthPromptSummary = operatingContext.customerHealthIntelligence
    ? buildCustomerHealthPromptSummary(operatingContext.customerHealthIntelligence)
    : null;

  const executiveManagerContext = buildExecutivePromptBridge({
    organizationId: input.organizationId,
    executiveAwareness: operatingContext.executiveAwareness,
    executiveScorecard: operatingContext.executiveScorecard,
    executiveNarrative: operatingContext.executiveNarrative,
    executiveFocus: operatingContext.executiveFocus,
    executiveForecast: operatingContext.executiveForecast,
    executiveAlerts: operatingContext.executiveAlerts,
    executiveDecisionContext: operatingContext.executiveDecisionContext,
    executiveRhythm: operatingContext.executiveRhythm,
    paymentContext: operatingContext.paymentContext,
    paymentIntelligence: operatingContext.paymentIntelligence,
    quoteContext: operatingContext.quoteContext,
    quoteIntelligence: operatingContext.quoteIntelligence,
    collectionActionContext: operatingContext.collectionActionContext,
    latestBriefing: operatingContext.latestBriefing?.briefingPackage ?? null,
    signalTrendContext: operatingContext.signal.trendContext,
    failedSteps: operatingContext.diagnostics.failedSteps,
    goalIntelligence: operatingContext.goalIntelligence ?? null,
    executiveDecision: executiveDecisionResult.promptSummary,
    executiveDecisionFollowUp: operatingContext.executiveDecisionFollowUp?.promptSummary ?? null,
    executiveAccountability: operatingContext.executiveAccountability?.promptSummary ?? null,
    executiveDelegation: executiveDelegationPromptSummary,
    executiveResponsibilityMatrix: executiveResponsibilityMatrixPromptSummary,
    executivePerformanceSignal: executivePerformanceSignalPromptSummary,
    executiveManagementReview: executiveManagementReviewPromptSummary,
    customerPortfolio: customerPortfolioPromptSummary,
    customerHealth: customerHealthPromptSummary,
    expenseContext: operatingContext.expenseContext,
    expenseIntelligence: operatingContext.expenseIntelligence,
    financialHealthIntelligence: operatingContext.financialHealthIntelligence,
    companyPerformanceSignal: operatingContext.companyPerformanceSignal ?? null,
    executivePriority: operatingContext.executivePriority,
    executiveOperatingRhythm: operatingContext.executiveOperatingRhythm,
    executiveFollowUpIntelligence: operatingContext.executiveFollowUpIntelligence?.promptSummary ?? null,
  });

  const renderedPrompt = renderPromptTemplate({
    templateId,
    organizationSummary: input.organizationSummary,
    memoryContext: operatingContext.memoryContext,
    personContext: operatingContext.personContext,
    quoteContext: operatingContext.quoteContext,
    quoteIntelligence: operatingContext.quoteIntelligence,
    paymentContext: operatingContext.paymentContext,
    paymentIntelligence: operatingContext.paymentIntelligence,
    collectionActionContext: operatingContext.collectionActionContext,
    managerAdviceAugmentationContext: input.managerAdviceAugmentationContext,
    executiveBrainContext: input.executiveBrainContext,
    executiveConstitutionContext: input.executiveConstitutionContext,
    executiveCouncilActivation: input.executiveCouncilActivation,
    recommendationPackage,
    conversationState,
    briefingContext: operatingContext.latestBriefing?.briefingPackage ?? null,
    executiveForecast: operatingContext.executiveForecast,
    executiveAlerts: operatingContext.executiveAlerts,
    executiveRhythm: operatingContext.executiveRhythm,
    executiveDecisionContext: operatingContext.executiveDecisionContext,
    learningLoop: input.learningLoop ?? null,
    learningDecision: input.learningDecision ?? null,
    resolverDecision,
    signalTrendContext: operatingContext.signal.trendContext,
    executiveManagerContext,
    goalIntelligence: operatingContext.goalIntelligence ?? null,
    executiveOperatingSystem: input.executiveOperatingSystem ?? null,
  });

  const providerInput = {
    systemPrompt: renderedPrompt.systemPrompt,
    userMessage: input.userMessage,
    context: operatingContext.memoryContext,
    metadata: {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
    },
  };

  let streamHandle: OpenAiStreamHandle;

  if (providerName === "openai") {
    streamHandle = createOpenAiStream(providerInput);
  } else {
    // mock provider: collect response synchronously, yield as single chunk
    const mockResult = await getAiProvider("mock").generateResponse(providerInput);
    const mockContent = mockResult.content;
    async function* mockTextStream(): AsyncGenerator<string, void, unknown> {
      yield mockContent;
    }
    streamHandle = {
      textStream: mockTextStream(),
      getFinalMeta: async () => ({
        model: mockResult.model,
        provider: mockResult.provider,
        usage: mockResult.usage,
        rawResponseId: "",
        content: mockContent,
      }),
    };
  }

  const pre: AiGatewayStreamPre = {
    conversationId: input.conversationId,
    memoryContext: operatingContext.memoryContext,
    collectionActionContext: operatingContext.collectionActionContext,
    quoteContext: operatingContext.quoteContext,
    systemPrompt: renderedPrompt.systemPrompt,
    promptTemplate: {
      id: renderedPrompt.templateId,
      version: renderedPrompt.templateVersion,
    },
    conversationState,
    executiveDecisionContext: operatingContext.executiveDecisionContext,
    resolverDecision,
    executiveDecisionResult,
    executiveDelegationResult,
    executiveResponsibilityMatrixResult,
    executivePerformanceSignalResult,
    executiveManagementReviewResult,
  };

  return {
    pre,
    textStream: streamHandle.textStream,
    getFinalMeta: streamHandle.getFinalMeta,
  };
}
