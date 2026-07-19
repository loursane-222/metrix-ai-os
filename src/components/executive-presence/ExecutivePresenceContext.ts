"use client";

import { createContext, useContext } from "react";
import type {
  ExecutivePresenceEvent,
  ExecutivePresenceSnapshot,
} from "@/lib/executive-presence/behavior-runtime";
import type { ExecutiveActivitySnapshot } from "@/lib/executive-activity";

export type ExecutivePresencePresentationMode = "floating" | "full-screen";

export type ExecutivePresenceRuntime = {
  behaviorSnapshot: ExecutivePresenceSnapshot;
  activitySnapshot: ExecutiveActivitySnapshot;
  publishPresenceEvent: (event: ExecutivePresenceEvent) => void;
  isPanelOpen: boolean;
  hasChatContentMounted: boolean;
  presentationMode: ExecutivePresencePresentationMode;
  openPanel: () => void;
  closePanel: () => void;
  mountChatContent: () => void;
  openFullConversation: () => void;
};

export const ExecutivePresenceContext = createContext<ExecutivePresenceRuntime | null>(null);

export function useExecutivePresence(): ExecutivePresenceRuntime {
  const runtime = useContext(ExecutivePresenceContext);

  if (!runtime) {
    throw new Error("useExecutivePresence must be used within ExecutivePresenceRuntimeProvider");
  }

  return runtime;
}
