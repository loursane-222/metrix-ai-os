// LearningLoop için güvenli giriş kapısı.
// Sadece JSON.parse ve root alan varlık kontrolü yapar.
// Prompt contract "yalnızca JSON" garantisi verir; parser bu garantiyi gevşetmez.

import type { ExecutiveLearningLoop } from "./learning-loop.types";

const REQUIRED_ROOT_FIELDS = [
  "shouldLearn",
  "candidates",
  "blockedReason",
] as const;

export function parseLearningLoop(raw: string): ExecutiveLearningLoop {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("LearningLoop: JSON parse başarısız.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("LearningLoop: LLM yanıtı geçerli bir nesne değil.");
  }

  const obj = parsed as Record<string, unknown>;

  for (const field of REQUIRED_ROOT_FIELDS) {
    if (!(field in obj)) {
      throw new Error(`LearningLoop: Zorunlu alan eksik: "${field}".`);
    }
  }

  return parsed as ExecutiveLearningLoop;
}
