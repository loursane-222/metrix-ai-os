"use client";

import { ExecutivePresenceConversation } from "./ExecutivePresenceConversation";

type ExecutivePresencePanelProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function ExecutivePresencePanel({ isOpen, onClose }: ExecutivePresencePanelProps) {
  return (
    <section
      aria-hidden={!isOpen}
      aria-label="Executive Presence"
      className={`fixed inset-x-4 z-50 flex h-[min(68dvh,620px)] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1218]/95 shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-2xl md:left-auto md:right-8 md:w-[440px] ${
        isOpen ? "" : "pointer-events-none invisible"
      }`}
      style={{ bottom: "calc(184px + env(safe-area-inset-bottom))" }}
    >
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.08] px-5">
        <div>
          <h2 className="text-sm font-semibold tracking-[-0.01em] text-[#f4f7f8]">
            Executive Presence
          </h2>
          <p className="mt-0.5 text-[11px] font-medium text-[#82909c]">AI Genel Müdür</p>
        </div>
        <button
          aria-label="Sohbeti kapat"
          className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-sm font-medium text-[#d8e0e4] hover:bg-white/[0.08]"
          onClick={onClose}
          type="button"
        >
          X
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <ExecutivePresenceConversation />
      </div>
    </section>
  );
}
