"use client";

import { createContext, useContext } from "react";

export type ExecutivePresencePresentationMode = "floating" | "full-screen";

export type ExecutivePresenceRuntime = {
  isPanelOpen: boolean;
  hasChatContentMounted: boolean;
  presentationMode: ExecutivePresencePresentationMode;
  openPanel: () => void;
  closePanel: () => void;
  mountChatContent: () => void;
};

export const ExecutivePresenceContext = createContext<ExecutivePresenceRuntime | null>(null);

export function useExecutivePresence(): ExecutivePresenceRuntime {
  const runtime = useContext(ExecutivePresenceContext);

  if (!runtime) {
    throw new Error("useExecutivePresence must be used within ExecutivePresenceRuntimeProvider");
  }

  return runtime;
}
