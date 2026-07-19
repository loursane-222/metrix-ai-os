"use client";

import { useEffect, useRef } from "react";
import { ExecutivePresenceConversation } from "./ExecutivePresenceConversation";
import { useExecutivePresence } from "./ExecutivePresenceContext";

type ExecutivePresencePanelProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function ExecutivePresencePanel({ isOpen, onClose }: ExecutivePresencePanelProps) {
  const { behaviorSnapshot } = useExecutivePresence();
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <section
      aria-hidden={!isOpen}
      aria-label="Executive command and activity"
      aria-modal="false"
      className={`fixed inset-x-3 bottom-[calc(92px+env(safe-area-inset-bottom))] z-50 flex max-h-[min(72dvh,680px)] min-h-[320px] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#0d1218]/95 shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-2xl md:inset-y-5 md:left-auto md:right-5 md:max-h-none md:w-[390px] ${
        isOpen ? "" : "pointer-events-none invisible"
      }`}
      data-presence-status={behaviorSnapshot.status}
      ref={panelRef}
      role="dialog"
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <ExecutivePresenceConversation onClose={onClose} />
      </div>
    </section>
  );
}
