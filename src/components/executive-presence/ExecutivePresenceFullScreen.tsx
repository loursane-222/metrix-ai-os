"use client";

import { useEffect } from "react";
import { ExecutivePresenceConversation } from "./ExecutivePresenceConversation";
import { useExecutivePresence } from "./ExecutivePresenceContext";

export function ExecutivePresenceFullScreen() {
  const { behaviorSnapshot, mountChatContent } = useExecutivePresence();

  useEffect(() => {
    mountChatContent();
  }, [mountChatContent]);

  return (
    <main
      className="h-dvh min-h-0 overflow-hidden bg-[#faf8f3]"
      data-presence-status={behaviorSnapshot.status}
    >
      <ExecutivePresenceConversation />
    </main>
  );
}
