import { buildExecutiveIntelligence } from "@/lib/executive-intelligence";
import { buildMemoryContextForOrganization } from "@/lib/memory/memory-context-builder.service";
import type { ConversationUnderstanding } from "@/lib/conversation-understanding";
import type { ExecutiveIntelligenceResult } from "@/lib/executive-intelligence";
import type { MemoryContext } from "@/lib/memory/memory-context.types";
import type { ExecutiveOperatingSystem } from "@/lib/executive-operating-system";

export type ChatExecutiveIntelligenceInput = {
  organizationId: string;
  message: string;
  generatedAt: string;
  understanding: ConversationUnderstanding;
};

export type ChatExecutiveIntelligenceDependencies = Readonly<{
  buildMemoryContext: (input: { organizationId: string }) => Promise<MemoryContext | null>;
  buildIntelligence: typeof buildExecutiveIntelligence;
}>;

export type ChatExecutiveCognitionStatus =
  | "skipped_not_required"
  | "generated_and_consumed"
  | "generation_failed_fallback_null"
  | "unavailable";

export type ChatExecutiveCognitionResult = Readonly<{
  understanding: ConversationUnderstanding;
  executiveOperatingSystem: ExecutiveOperatingSystem | null;
  diagnostics: ExecutiveIntelligenceResult["diagnostics"] | null;
  status: ChatExecutiveCognitionStatus;
}>;

export type ChatExecutiveCognitionObservation = Readonly<{
  status: ChatExecutiveCognitionStatus;
  generatedAt: string | null;
  reasoningConfidence: number | null;
  reasoningSummary: string | null;
  recommendedNextMove: string | null;
  urgency: ExecutiveOperatingSystem["reasoning"]["timing"]["urgency"] | null;
  conversationKind: ConversationUnderstanding["conversationKind"];
  suggestedHandling: ConversationUnderstanding["suggestedHandling"];
}>;

const DEFAULT_DEPENDENCIES: ChatExecutiveIntelligenceDependencies = {
  buildMemoryContext: buildMemoryContextForOrganization,
  buildIntelligence: buildExecutiveIntelligence,
};

export async function buildChatExecutiveIntelligence(
  input: ChatExecutiveIntelligenceInput,
  dependencies: ChatExecutiveIntelligenceDependencies = DEFAULT_DEPENDENCIES,
): Promise<ExecutiveIntelligenceResult | null> {
  try {
    const memoryContext = await dependencies.buildMemoryContext({
      organizationId: input.organizationId,
    });

    return await dependencies.buildIntelligence({
      message: input.message,
      memoryContext,
      generatedAt: input.generatedAt,
      understanding: input.understanding,
    });
  } catch (error) {
    console.warn("[ChatExecutiveIntelligence] build failed; returning null fallback", {
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

export async function resolveChatExecutiveCognition(
  input: ChatExecutiveIntelligenceInput,
  buildIntelligence: typeof buildChatExecutiveIntelligence = buildChatExecutiveIntelligence,
): Promise<ChatExecutiveCognitionResult> {
  if (!input.understanding.shouldInvokeExecutiveBrain) {
    return {
      understanding: input.understanding,
      executiveOperatingSystem: null,
      diagnostics: null,
      status: "skipped_not_required",
    };
  }

  try {
    const intelligence = await buildIntelligence(input);
    if (!intelligence) {
      return {
        understanding: input.understanding,
        executiveOperatingSystem: null,
        diagnostics: null,
        status: "generation_failed_fallback_null",
      };
    }

    if (!intelligence.executiveOperatingSystem) {
      return {
        understanding: intelligence.understanding,
        executiveOperatingSystem: null,
        diagnostics: intelligence.diagnostics,
        status: "unavailable",
      };
    }

    return {
      understanding: intelligence.understanding,
      executiveOperatingSystem: intelligence.executiveOperatingSystem,
      diagnostics: intelligence.diagnostics,
      status: "generated_and_consumed",
    };
  } catch (error) {
    console.warn("[ChatExecutiveIntelligence] generation failed; continuing without EOS:", error);
    return {
      understanding: input.understanding,
      executiveOperatingSystem: null,
      diagnostics: null,
      status: "generation_failed_fallback_null",
    };
  }
}

export function buildChatExecutiveCognitionObservation(
  cognition: ChatExecutiveCognitionResult,
): ChatExecutiveCognitionObservation {
  const eos = cognition.executiveOperatingSystem;

  return {
    status: cognition.status,
    generatedAt: eos?.generatedAt ?? null,
    reasoningConfidence: eos?.reasoning.confidence ?? null,
    reasoningSummary: eos?.reasoning.summary.slice(0, 240) ?? null,
    recommendedNextMove: eos?.recommendedNextMove.title.slice(0, 160) ?? null,
    urgency: eos?.reasoning.timing.urgency ?? null,
    conversationKind: cognition.understanding.conversationKind,
    suggestedHandling: cognition.understanding.suggestedHandling,
  };
}
