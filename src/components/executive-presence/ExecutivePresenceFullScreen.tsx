"use client";

import { useEffect } from "react";
import { ExecutivePresenceConversation } from "./ExecutivePresenceConversation";
import { useExecutivePresence } from "./ExecutivePresenceContext";

export function ExecutivePresenceFullScreen() {
  const { mountChatContent } = useExecutivePresence();

  useEffect(() => {
    mountChatContent();
  }, [mountChatContent]);

  return (
    <main className="h-dvh min-h-0 overflow-hidden bg-[#faf8f3]">
      <ExecutivePresenceConversation />
    </main>
  );
}
