"use client";

import { useExecutivePresence } from "./ExecutivePresenceContext";
import { ExecutivePresenceOrb } from "./ExecutivePresenceOrb";
import { ExecutivePresencePanel } from "./ExecutivePresencePanel";
import { ExecutivePageFocusHost } from "./ExecutivePageFocusHost";

export function ExecutivePresenceHost() {
  const {
    closePanel,
    hasChatContentMounted,
    isPanelOpen,
    presentationMode,
  } = useExecutivePresence();

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
