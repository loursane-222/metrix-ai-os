import type { ExecutivePresenceStatus } from "@/lib/executive-presence/behavior-runtime";
import type { VoicePresence } from "@/components/metrix-tab/voice/useVoiceExperienceOrchestrator";

export type ExecutiveFaceState = "idle" | "listening" | "thinking" | "speaking" | "working" | "error";

export type ExecutiveFacePresenceInput = Readonly<{
  behaviorStatus: ExecutivePresenceStatus;
  voicePresence: VoicePresence["kind"];
}>;

export function resolveExecutiveFaceState({
  behaviorStatus,
  voicePresence,
}: ExecutiveFacePresenceInput): ExecutiveFaceState {
  if (behaviorStatus === "error") return "error";
  if (voicePresence === "speaking") return "speaking";
  if (voicePresence === "thinking" || behaviorStatus === "thinking") return "thinking";
  if (voicePresence === "listening" || voicePresence === "userSpeaking" || behaviorStatus === "listening") return "listening";
  if (behaviorStatus === "applying" || behaviorStatus === "executing" || behaviorStatus === "awaiting_approval") return "working";
  return "idle";
}
