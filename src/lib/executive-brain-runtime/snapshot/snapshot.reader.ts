import type { ExecutiveBrainSnapshot } from "./snapshot.types";

/**
 * readExecutiveBrainSnapshot — Conversation'a ait snapshot'ı okur.
 *
 * Bu fazda persistence yoktur; her zaman null döner.
 * Gerçek okuma Faz 1B'de DB entegrasyonu ile eklenecektir.
 */
export async function readExecutiveBrainSnapshot(
  conversationId: string,
): Promise<ExecutiveBrainSnapshot | null> {
  void conversationId;
  return null;
}
