import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/components/metrix-tab/MetrixChatTab.tsx"), "utf8");

describe("MetrixChatTab session/history lifecycle contract", () => {
  it("clears both restore authorities on logout", () => {
    const logout = source.slice(source.indexOf("async function logout()"));
    expect(logout).toContain("sessionStorage.removeItem(CONVERSATION_STORAGE_KEY)");
    expect(logout).toContain("sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY)");
  });

  it("keeps history selection explicit and loads the selected conversation", () => {
    const selection = source.slice(
      source.indexOf("async function selectHistoryItem"),
      source.indexOf("function startNewConversation"),
    );
    expect(selection).toContain("await loadConversation(id)");
    expect(selection).toContain("orchestrator.stop()");
  });

  it("keeps new conversation lazy and does not call a create endpoint", () => {
    const newConversation = source.slice(
      source.indexOf("function startNewConversation"),
      source.indexOf("function startTypingInterval"),
    );
    expect(newConversation).toContain("setConversationId(null)");
    expect(newConversation).not.toContain("fetch(");
  });
});
