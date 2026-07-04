import type { ExecutiveBrainSnapshot } from "./snapshot.types";

/**
 * writeExecutiveBrainSnapshot — Snapshot'ı conversation'a yazar.
 *
 * Bu fazda persistence yoktur; no-op olarak çalışır.
 * Asla throw etmez.
 * Gerçek yazma Faz 1B'de DB entegrasyonu ile eklenecektir.
 */
export async function writeExecutiveBrainSnapshot(_input: {
  conversationId: string;
  snapshot: ExecutiveBrainSnapshot;
}): Promise<void> {
  // no-op stub
}
