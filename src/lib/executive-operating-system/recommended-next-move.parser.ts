// RecommendedNextMove için güvenli giriş kapısı.
// Sadece JSON.parse ve root alan varlık kontrolü yapar.
// Prompt contract "yalnızca JSON" garantisi verir; parser bu garantiyi gevşetmez.

import type { RecommendedNextMove } from "./recommended-next-move.types";

const REQUIRED_ROOT_FIELDS = [
  "title",
  "rationale",
  "expectedImpact",
  "confidence",
  "timeframe",
  "alternatives",
  "missingInformation",
  "followUpTrigger",
] as const;

export function parseRecommendedNextMove(raw: string): RecommendedNextMove {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("RecommendedNextMove: JSON parse başarısız.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("RecommendedNextMove: LLM yanıtı geçerli bir nesne değil.");
  }

  const obj = parsed as Record<string, unknown>;

  for (const field of REQUIRED_ROOT_FIELDS) {
    if (!(field in obj)) {
      throw new Error(`RecommendedNextMove: Zorunlu alan eksik: "${field}".`);
    }
  }

  return parsed as RecommendedNextMove;
}
