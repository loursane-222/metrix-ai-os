import { generateExecutiveContextV2Raw } from "./executive-context-builder.gateway";
import { parseExecutiveContextV2 } from "./executive-context-builder.parser";
import type {
  ContextStatus,
  ExecutiveContext,
  ExecutiveContextInput,
  ExecutiveContextV2,
} from "./executive-context-builder.types";
import type { ConversationUnderstanding } from "@/lib/conversation-understanding";

function createSkippedContext(input: ExecutiveContextInput): ExecutiveContext {
  return {
    contextStatus: "skipped",
    shouldProceed: false,
    entityCandidates: [],
    contextNeeds: [],
    actionIntentSummary: "",
    topicSummary: "",
    assembledFrom: input.understanding,
    reasoning: {
      summary: "Executive Brain tetiklenmedi; context assembly atlandı.",
      whyProceed: input.understanding.reasoning.summary,
      entityDiscoveryMethod: "not_attempted",
      needsIdentified: [],
    },
  };
}

function resolveContextStatus(
  understanding: ExecutiveContextInput["understanding"],
): ContextStatus {
  if (understanding.shouldAskClarification) return "needs_clarification";
  if (understanding.confidence === "low") return "needs_clarification";
  if (understanding.companyRelevance === "none") return "not_enough_signal";
  return "ready";
}

export async function buildExecutiveContextV2(input: {
  message: string;
  understanding: ConversationUnderstanding;
}): Promise<ExecutiveContextV2> {
  const raw = await generateExecutiveContextV2Raw(input.message, input.understanding);
  return parseExecutiveContextV2(raw, input.understanding);
}

export function buildExecutiveContext(
  input: ExecutiveContextInput,
): ExecutiveContext {
  const { understanding } = input;

  if (!understanding.shouldInvokeExecutiveBrain) {
    return createSkippedContext(input);
  }

  // Bu fazda entity extraction yapılmıyor.
  // understanding.reasoning içinden türetilmiş özetler taşınıyor.
  // İleride: LLM çağrısıyla entityCandidates ve contextNeeds doldurulacak.

  const contextStatus = resolveContextStatus(understanding);
  const hasActionIntent = understanding.actionExpectation !== "none";

  return {
    contextStatus,
    shouldProceed: contextStatus === "ready",
    entityCandidates: [],  // TODO: LLM entity extraction
    contextNeeds: [],      // TODO: LLM context need inference
    actionIntentSummary: hasActionIntent
      ? `Kullanıcı bir eylem bekliyor: ${understanding.actionExpectation}`
      : "Açık eylem beklentisi yok.",
    topicSummary: understanding.reasoning.summary,
    assembledFrom: understanding,
    reasoning: {
      summary: `Context ${contextStatus} durumunda. Entity extraction henüz yapılmadı.`,
      whyProceed: understanding.reasoning.whyThisHandling,
      entityDiscoveryMethod: "not_attempted",
      needsIdentified: understanding.reasoning.observations,
    },
  };
}
