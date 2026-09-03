// Opaque conversation session reference, client-side — mirrors the existing
// module-level pattern calendar-command-channel.ts already uses for
// cross-cutting client state a ConversationExtension's own execute()
// signature doesn't carry. Holds no business/entity truth — only the
// conversationId MetrixChatTab already tracks for its own chat history, so
// a server route can look up that organization's own persisted
// last-successful-operation context (see plan-and-run/route.ts) rather than
// trusting anything about entities from the client.
let activeConversationId: string | null = null;

export function setActiveConversationId(id: string | null): void {
  activeConversationId = id;
}

export function getActiveConversationId(): string | null {
  return activeConversationId;
}
