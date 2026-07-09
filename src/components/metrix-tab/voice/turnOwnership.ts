import type { VoicePresence } from "./useVoiceExperienceOrchestrator";

// Presence Engine's authority contract: who holds the conversational floor
// right now. This is the only legitimate place ownership is decided — it is
// derived exclusively from the turn-lifecycle state already recorded in
// VoicePresence (set at beginTurn/interrupt/handleQueueEmpty/etc.), never
// from whether ack text, an Executive Brain response, or TTS audio has
// arrived. Ownership exists before content; content is a downstream
// consumer of it, not its source.
export type TurnOwner = "user" | "metrix" | "neutral";

export function deriveTurnOwner(presenceKind: VoicePresence["kind"]): TurnOwner {
  switch (presenceKind) {
    case "idle":
    case "connecting":
      return "neutral";
    case "listening":
    case "userSpeaking":
      return "user";
    case "thinking":
    case "speaking":
      return "metrix";
  }
}
