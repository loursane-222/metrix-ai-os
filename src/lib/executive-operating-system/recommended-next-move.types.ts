// Recommended Next Move — EOS'un yöneticiye önerdiği somut adım.

export type NextMoveConfidence = "low" | "medium" | "high";

export type NextMoveAlternative = {
  title: string;
  rationale: string;
  tradeOff: string;
};

export type NextMoveTimeframe =
  | "immediate"
  | "today"
  | "this_week"
  | "this_month"
  | "undetermined";

/**
 * RecommendedNextMove — GM'in önerdiği tek, somut sonraki adım.
 *
 * Contract garantileri:
 *   - title: Boş olamaz; eylemi tanımlayan kısa ifade.
 *   - rationale: ExecutiveReasoning'den türeyen gerekçe; LLM tarafından üretilir.
 *   - expectedImpact: Hareket başarıyla uygulandığında beklenen somut sonuç.
 *   - confidence: Reasoning confidence'ının kategorik karşılığı (low/medium/high).
 *   - timeframe: Hareketin ne zaman alınması gerektiğini ifade eder.
 *   - alternatives: Boş dizi geçerlidir; "başka seçenek yok" anlamına gelir.
 *   - missingInformation: Belirsizliği artıran eksik bilgiler; boş dizi geçerlidir.
 *   - followUpTrigger: Bir sonraki gözden geçirmeyi tetikleyecek durum veya null.
 */
export type RecommendedNextMove = {
  title: string;
  rationale: string;
  expectedImpact: string;
  confidence: NextMoveConfidence;
  timeframe: NextMoveTimeframe;
  alternatives: NextMoveAlternative[];
  missingInformation: string[];
  followUpTrigger: string | null;
};

export const NEXT_MOVE_PLACEHOLDER: RecommendedNextMove = {
  title: "Hareket henüz belirlenmedi.",
  rationale: "Recommended Next Move bu fazda üretilmiyor.",
  expectedImpact: "Beklenen etki henüz hesaplanmadı.",
  confidence: "low",
  timeframe: "undetermined",
  alternatives: [],
  missingInformation: [],
  followUpTrigger: null,
};
