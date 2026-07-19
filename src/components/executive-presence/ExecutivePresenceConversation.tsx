"use client";

import { MetrixChatTab } from "@/components/metrix-tab/MetrixChatTab";
import { executivePresenceApiPost } from "@/lib/executive-presence/api-post";

export function ExecutivePresenceConversation({ onClose }: { onClose?: () => void }) {
  return <MetrixChatTab apiPost={executivePresenceApiPost} onClose={onClose} presentation="command" />;
}
