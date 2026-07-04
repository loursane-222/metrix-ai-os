// ExecutiveReasoning için güvenli giriş kapısı.
// Sadece JSON.parse ve root alan varlık kontrolü yapar.
// Prompt contract "yalnızca JSON" garantisi verir; parser bu garantiyi gevşetmez.

import type { ExecutiveReasoning } from "./executive-reasoning.types";

const REQUIRED_ROOT_FIELDS = [
  "evidence",
  "risks",
  "priorities",
  "opportunities",
  "timing",
  "organizationalImpact",
  "tradeOffs",
  "confidence",
  "summary",
] as const;

export function parseExecutiveReasoning(raw: string): ExecutiveReasoning {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("ExecutiveReasoning: JSON parse başarısız.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("ExecutiveReasoning: LLM yanıtı geçerli bir nesne değil.");
  }

  const obj = parsed as Record<string, unknown>;

  for (const field of REQUIRED_ROOT_FIELDS) {
    if (!(field in obj)) {
      throw new Error(`ExecutiveReasoning: Zorunlu alan eksik: "${field}".`);
    }
  }

  return parsed as ExecutiveReasoning;
}
