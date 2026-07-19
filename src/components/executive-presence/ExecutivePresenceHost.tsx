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

  return (
    <>
      {presentationMode === "floating" ? <ExecutivePresenceOrb /> : null}
      {hasChatContentMounted ? (
        <ExecutivePresencePanel isOpen={isPanelOpen} onClose={closePanel} />
      ) : null}
    </>
  );
}
