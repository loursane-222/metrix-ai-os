"use client";

import { useMemo } from "react";
import { useExecutivePresence } from "./ExecutivePresenceContext";
import { ExecutivePresenceOrb } from "./ExecutivePresenceOrb";
import { ExecutivePresencePanel } from "./ExecutivePresencePanel";
import { ExecutivePageFocusHost } from "./ExecutivePageFocusHost";
import { useUniversalInputRegistrations, type UniversalRegistrationInput } from "@/components/input-authority";

export function ExecutivePresenceHost() {
  const {
    closePanel,
    hasChatContentMounted,
    isPanelOpen,
    presentationMode,
    openPanel,
  } = useExecutivePresence();
  const registrations = useMemo<readonly UniversalRegistrationInput[]>(() => [{ descriptor: { executiveTargetId: "surface.executive-presence.panel", authorityKey: "executive.presence.panel", targetKind: "surface", surfaceType: "command_panel", module: "executive-presence", label: "METRIX Executive Presence", description: "Evrensel executive komut ve konuşma paneli", visibility: isPanelOpen ? "visible" : "hidden", mounted: true, active: isPanelOpen, open: isPanelOpen, modal: false, closable: true, openable: true, focusable: true, focusScope: true, zOrder: 900, order: 900 }, adapter: { readState: () => ({ visible: isPanelOpen, active: isPanelOpen, open: isPanelOpen, expanded: false, selected: false, modal: false, disabled: false }), open: openPanel, close: closePanel, reveal: openPanel, focus: openPanel } }], [closePanel, isPanelOpen, openPanel]);
  useUniversalInputRegistrations(registrations);

  return (
    <>
      <ExecutivePageFocusHost />
      {presentationMode === "floating" ? <ExecutivePresenceOrb /> : null}
      {hasChatContentMounted ? (
        <ExecutivePresencePanel isOpen={isPanelOpen} onClose={closePanel} />
      ) : null}
    </>
  );
}
