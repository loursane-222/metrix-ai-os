"use client";

import { useExecutivePresence } from "./ExecutivePresenceContext";

export function ExecutivePresenceOrb() {
  const { behaviorSnapshot, openPanel } = useExecutivePresence();

  return (
    <button
      aria-label="Metrix ile konuş"
      className="fixed right-4 z-40 h-16 w-16 overflow-hidden rounded-full border border-[#35dce3]/60 bg-[#071417] shadow-[0_8px_28px_rgba(20,180,187,0.28)] transition-transform hover:scale-[1.03] active:scale-[0.98] md:bottom-8 md:right-8"
      data-presence-status={behaviorSnapshot.status}
      onClick={openPanel}
      style={{ bottom: "calc(104px + env(safe-area-inset-bottom))" }}
      type="button"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        className="pointer-events-none h-full w-full select-none object-contain"
        draggable={false}
        src="/design/executive-presence-orb.png"
      />
    </button>
  );
}
