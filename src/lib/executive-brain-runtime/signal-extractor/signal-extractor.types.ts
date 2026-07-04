/**
 * Runtime seviyesinde mesajdan çıkarılan sinyal tipleri.
 * executive-brain/executive-brain.types.ts'deki legacy Signal'den bağımsızdır.
 */

/** Sinyalin hangi kategoriye ait olduğunu tanımlar. */
export type ExecutiveBrainSignalType =
  | "intent"
  | "commitment"
  | "risk"
  | "decision"
  | "sentiment"
  | "information"
  | "action_requested"
  | "unknown";

/** Sinyalin güvenilirlik kategorisi. */
export type ExecutiveBrainSignalConfidence = "low" | "medium" | "high";

/**
 * ExecutiveBrainSignal — Mesajdan çıkarılan tekil sinyal birimi.
 *
 * Contract garantileri:
 *   - id: Konuşma içinde benzersiz; izleme için kullanılır.
 *   - value: Ham sinyal içeriği; yorumlama Policy Engine'e aittir.
 *   - sourceMessageId: Sinyalin çıkarıldığı mesajın kimliği.
 */
export type ExecutiveBrainSignal = {
  id: string;
  type: ExecutiveBrainSignalType;
  value: string;
  confidence: ExecutiveBrainSignalConfidence;
  sourceMessageId: string;
  extractedAt: string;
};
