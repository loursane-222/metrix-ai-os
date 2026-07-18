import { evaluateKnowledgeSignal } from "@/lib/executive-knowledge-authority";
import type { KnowledgeProjection } from "@/lib/executive-knowledge-authority";
import type { ExecutiveMindState } from "@/lib/ai/executive-conversation.types";

export function buildMindStateKnowledgeProjections(
  mindState: ExecutiveMindState,
): KnowledgeProjection[] {
  const signals = [
    ...(mindState.hypotheses ?? []).map((item) => ({ key: item.id, value: item.summary, epistemicType: "HYPOTHESIS" as const })),
    ...(mindState.beliefs ?? []).map((item) => ({ key: item.id, value: item.summary, epistemicType: "BELIEF" as const })),
    ...(mindState.workingMemory ?? []).map((item) => ({ key: item.key, value: item.value, epistemicType: "SIGNAL" as const })),
  ];

  return signals.flatMap((signal) =>
    evaluateKnowledgeSignal({
      producer: "MIND_STATE",
      ...signal,
      conversationScoped: true,
      durable: false,
    }).projections.filter((projection) => projection.target === "MIND_STATE"),
  );
}
