// Phase 14's own browser-session "currently active document" pointer —
// deliberately separate from conversation-attachments/attachment-session.ts,
// which is the customer-document flow's private session store (hardcoded
// storage key, PATCHes /api/customers/document-attachments/*). Reusing that
// module here would silently PATCH the wrong endpoint and collide with an
// in-progress customer document draft in the same browser tab. This is a
// client-side UI state pointer, not a second server-side attachment system
// — the server-side table is the same CustomerDocumentAttachment row either
// way (see document-attachment.service.ts).
const STORAGE_KEY = "metrix-document-attachment-conversation-v1";
export type DocumentAttachmentReference = { attachmentRef: string; conversationId?: string; filename: string; mimeType: string; size: number; expiresAt: string };

function read(): { attachment?: DocumentAttachmentReference } {
  if (typeof sessionStorage === "undefined") return {};
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}") as { attachment?: DocumentAttachmentReference }; } catch { return {}; }
}
function write(state: { attachment?: DocumentAttachmentReference }) {
  if (typeof sessionStorage !== "undefined") sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function setActiveDocumentAttachment(attachment: DocumentAttachmentReference): void { write({ attachment }); }
export function getActiveDocumentAttachment(): DocumentAttachmentReference | undefined {
  const state = read();
  if (state.attachment && Date.now() >= new Date(state.attachment.expiresAt).getTime()) { clearActiveDocumentAttachment(); return undefined; }
  return state.attachment;
}
export function clearActiveDocumentAttachment(): void { if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(STORAGE_KEY); }
export function bindActiveDocumentAttachmentConversation(conversationId: string): void {
  const state = read();
  if (!state.attachment || state.attachment.conversationId === conversationId) return;
  state.attachment.conversationId = conversationId;
  write(state);
  void fetch(`/api/documents/attachments/${encodeURIComponent(state.attachment.attachmentRef)}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId }) });
}
