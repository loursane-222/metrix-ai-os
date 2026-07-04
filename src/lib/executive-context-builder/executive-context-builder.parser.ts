// ExecutiveContextV2 için güvenli giriş kapısı.
// Sadece JSON.parse ve root alan varlık kontrolü yapar.
// Prompt contract "yalnızca JSON" garantisi verir; parser bu garantiyi gevşetmez.

import type { ExecutiveContextV2 } from "./executive-context-builder.types";
import type { ConversationUnderstanding } from "@/lib/conversation-understanding";

const REQUIRED_ROOT_FIELDS = [
  "situationSummary",
  "weight",
  "intentClarity",
  "timeHorizon",
  "stakeholders",
  "knowledgeGaps",
  "canProceed",
  "proceedRationale",
] as const;

export function parseExecutiveContextV2(
  raw: string,
  assembledFrom: ConversationUnderstanding,
): ExecutiveContextV2 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("ExecutiveContextV2: JSON parse başarısız.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("ExecutiveContextV2: LLM yanıtı geçerli bir nesne değil.");
  }

  const obj = parsed as Record<string, unknown>;

  for (const field of REQUIRED_ROOT_FIELDS) {
    if (!(field in obj)) {
      throw new Error(`ExecutiveContextV2: Zorunlu alan eksik: "${field}".`);
    }
  }

  return {
    ...(parsed as Omit<ExecutiveContextV2, "assembledFrom">),
    assembledFrom,
  };
}
