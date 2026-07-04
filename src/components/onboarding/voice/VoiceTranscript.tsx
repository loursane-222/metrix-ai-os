"use client";

import type { VoiceDiscoveryTranscriptTurn } from "@/lib/onboarding/voice/realtime-session.types";

type VoiceTranscriptProps = {
  transcript: VoiceDiscoveryTranscriptTurn | null;
};

export function VoiceTranscript({ transcript }: VoiceTranscriptProps) {
  if (!transcript?.content) {
    return (
      <p className="min-h-[44px] text-center text-[14px] font-bold leading-6 text-[#756656]">
        Konuşmaya başladığında söylediklerin burada canlı görünür.
      </p>
    );
  }

  return (
    <p className="min-h-[44px] text-center text-[14px] font-black leading-6 text-[#071226]">
      {transcript.content}
    </p>
  );
}
