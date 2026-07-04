"use client";

import type { VoiceDiscoveryState } from "@/lib/onboarding/voice/realtime-session.types";

type VoiceOrbProps = {
  state: VoiceDiscoveryState;
};

export function VoiceOrb({ state }: VoiceOrbProps) {
  const isActive =
    state === "listening" ||
    state === "user_speaking" ||
    state === "metrix_speaking";

  return (
    <div className="relative grid h-[116px] w-[116px] place-items-center">
      <span
        className={`absolute inset-0 rounded-full ${
          isActive ? "animate-ping bg-[#5b8c7a]/18" : "bg-[#ead7bf]/60"
        }`}
      />
      <span
        className={`absolute inset-4 rounded-full ${
          state === "user_speaking"
            ? "bg-[#5b8c7a]/24"
            : state === "metrix_speaking"
              ? "bg-[#8a5a2b]/22"
              : "bg-white/72"
        }`}
      />
      <span className="relative grid h-[72px] w-[72px] place-items-center rounded-full bg-[#071226] shadow-[0_18px_42px_rgba(7,18,38,0.24)]">
        <span
          className={`h-8 w-8 rounded-full ${
            state === "error"
              ? "bg-[#d24a32]"
              : state === "thinking" || state === "reconnecting"
                ? "bg-[#d9ad7a]"
                : "bg-[#6ee7b7]"
          }`}
        />
      </span>
    </div>
  );
}
