"use client";

import { ExecutivePresenceConversation } from "./ExecutivePresenceConversation";
import { useExecutivePresence } from "./ExecutivePresenceContext";
import { ExecutivePresenceOrb } from "./ExecutivePresenceOrb";

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
        <div
          aria-hidden={!isPanelOpen}
          className={`fixed inset-0 z-50 bg-black/55 p-0 transition-opacity md:p-6 ${
            isPanelOpen ? "" : "pointer-events-none invisible opacity-0"
          }`}
        >
          <div className="ml-auto h-full w-full overflow-hidden bg-[#faf8f3] shadow-2xl md:max-w-[440px] md:rounded-lg">
            <div className="absolute right-3 top-3 z-10">
              <button
                aria-label="Sohbeti kapat"
                className="grid h-9 w-9 place-items-center rounded-full bg-[#17120d] text-sm font-black text-white"
                onClick={closePanel}
                type="button"
              >
                X
              </button>
            </div>
            <ExecutivePresenceConversation />
          </div>
        </div>
      ) : null}
    </>
  );
}
