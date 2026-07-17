"use client";

import { useExecutivePresence } from "./ExecutivePresenceContext";
import { ExecutivePresenceOrb } from "./ExecutivePresenceOrb";
import { ExecutivePresencePanel } from "./ExecutivePresencePanel";

export function ExecutivePresenceHost() {
  const {
    closePanel,
    hasChatContentMounted,
    isPanelOpen,
    presentationMode,
  } = useExecutivePresence();

  if (presentationMode === "full-screen") return null;

  return (
    <>
      <ExecutivePresenceOrb />
      {hasChatContentMounted ? (
        <ExecutivePresencePanel isOpen={isPanelOpen} onClose={closePanel} />
      ) : null}
    </>
  );
}
