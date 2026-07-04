// Executive Learning Loop — EOS seviyesinde öğrenme sinyali arayüzü.
// Öğrenme eylemini gerçekleştirmez; öğrenme niyetini ve gerekçesini taşır.
// Execution Layer veya sonraki agent bu sinyali alır ve uygular.

export type LearningSignalStrength = "weak" | "moderate" | "strong";

export type LearningTrigger =
  | "user_shared_fact"
  | "outcome_reported"
  | "commitment_made"
  | "pattern_detected"
  | "contradiction_found";

/**
 * LearningCandidate — Tek bir öğrenme önerisi.
 *
 * Contract garantileri:
 *   - key: Güncellenmesi önerilen bilginin tanımlayıcısı (örn. "monthly_revenue").
 *   - proposedValue: Önerilen yeni değer; yorumlama Execution Layer'a aittir.
 *   - rationale: Bu öğrenmenin neden önerildiğinin gerekçesi; trigger kategorisini tamamlar.
 *   - trigger: Öğrenmeyi hangi olay kategorisinin tetiklediği.
 *   - signalStrength: Sinyalin güvenilirlik düzeyi; zayıf sinyal düşük önceliği ifade eder.
 */
export type LearningCandidate = {
  key: string;
  proposedValue: string;
  rationale: string;
  trigger: LearningTrigger;
  signalStrength: LearningSignalStrength;
};

/**
 * ExecutiveLearningLoop — EOS'un öğrenme niyetini taşıyan üst kap.
 *
 * Contract garantileri:
 *   - shouldLearn: false ise candidates listesi dikkate alınmaz.
 *   - candidates: Boş dizi geçerlidir; "öğrenme adayı yok" anlamına gelir.
 *   - blockedReason: Öğrenme bloke edilmişse nedeni; shouldLearn true ise null olmalıdır.
 */
export type ExecutiveLearningLoop = {
  shouldLearn: boolean;
  candidates: LearningCandidate[];
  blockedReason: string | null;
};

export const LEARNING_LOOP_NOOP: ExecutiveLearningLoop = {
  shouldLearn: false,
  candidates: [],
  blockedReason: "Learning loop is not active in this phase.",
};
