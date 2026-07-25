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
  const isFullScreen = presentationMode === "full-screen";
  const isPublicSurfaceHidden = presentationMode === "hidden";
  const isSurfaceVisible = !isPublicSurfaceHidden && (isFullScreen || isPanelOpen);
  const shouldMountChatContent =
    !isPublicSurfaceHidden && (isFullScreen || hasChatContentMounted);
  const registrations = useMemo<readonly UniversalRegistrationInput[]>(() => isPublicSurfaceHidden ? [] : [{ descriptor: { executiveTargetId: "surface.executive-presence.panel", authorityKey: "executive.presence.panel", targetKind: "surface", surfaceType: "command_panel", module: "executive-presence", label: "METRIX Executive Presence", description: "Evrensel executive komut ve konuşma paneli", visibility: isSurfaceVisible ? "visible" : "hidden", mounted: true, active: isSurfaceVisible, open: isSurfaceVisible, modal: false, closable: !isFullScreen, openable: true, focusable: true, focusScope: true, zOrder: 900, order: 900 }, adapter: { readState: () => ({ visible: isSurfaceVisible, active: isSurfaceVisible, open: isSurfaceVisible, expanded: false, selected: false, modal: false, disabled: false }), open: openPanel, close: closePanel, reveal: openPanel, focus: openPanel } }], [closePanel, isFullScreen, isPublicSurfaceHidden, isSurfaceVisible, openPanel]);
  useUniversalInputRegistrations(registrations);

  return (
    <>
      <ExecutivePageFocusHost />
      {presentationMode === "floating" ? <ExecutivePresenceOrb /> : null}
      {shouldMountChatContent ? (
        <ExecutivePresencePanel isOpen={isSurfaceVisible} onClose={closePanel} />
      ) : null}
    </>
  );
}
