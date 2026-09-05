import { afterEach, describe, expect, it, vi } from "vitest";
import { executeActiveConversationExtension, resetConversationExtensionTurnCacheForTests } from "../active-conversation-extension";

// Legacy Domain Semantic Ownership Final Consolidation: production-management
// was retired from active dispatch (thin production.create wrapper, no
// deterministic sub-logic of its own — see conversation-extension-ownership-registry.ts).
// This utterance no longer gets a direct handoff from the extension layer;
// it now falls through to NOT_HANDLED here, which is exactly what routes the
// turn to the METRIX Executive Agent (production.create in the canonical
// Action Registry) instead.
describe("production command through active extension entry point", () => {
  afterEach(() => { resetConversationExtensionTurnCacheForTests(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it("no longer claims yeni üretim emri oluştur at the extension layer — falls through to the Executive Agent", async () => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    const result = await executeActiveConversationExtension({ utterance: "yeni üretim emri oluştur", source: "written", turnKey: "production-create-active" });
    expect(result.status).toBe("NOT_HANDLED");
    expect(result.handoff).toBeNull();
  });
});
