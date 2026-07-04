import type { ExecutiveBrainSignal } from "./signal-extractor.types";

type SignalExtractorInput = {
  messageId: string;
  message: string;
  existingSignals?: ExecutiveBrainSignal[];
};

/**
 * extractExecutiveBrainSignals — Mesajdan runtime sinyalleri çıkarır.
 *
 * Bu fazda analiz yoktur; tek bir UNKNOWN/low sinyal üretir.
 * Gerçek keyword/intent analizi ileriki fazda eklenecektir.
 * Asla throw etmez.
 */
export function extractExecutiveBrainSignals(
  input: SignalExtractorInput,
): ExecutiveBrainSignal[] {
  return [
    {
      id: `sig-${input.messageId}-stub`,
      type: "unknown",
      value: input.message.slice(0, 120),
      confidence: "low",
      sourceMessageId: input.messageId,
      extractedAt: new Date().toISOString(),
    },
  ];
}
