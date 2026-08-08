import { afterEach, describe, expect, it, vi } from "vitest";
import { executeActiveConversationExtension, resetConversationExtensionTurnCacheForTests } from "../active-conversation-extension";

describe("supplier command through active extension entry point", () => {
  afterEach(() => { resetConversationExtensionTurnCacheForTests(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it("routes yeni tedarikçi ekle to the supplier create surface", async () => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    const result = await executeActiveConversationExtension({ utterance: "yeni tedarikçi ekle", source: "written", turnKey: "supplier-create-active" });
    expect(result.handoff).toMatchObject({ outcomeCode: "SUPPLIER_CREATE_OPENED" });
  });
});
