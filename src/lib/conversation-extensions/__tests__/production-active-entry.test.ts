import { afterEach, describe, expect, it, vi } from "vitest";
import { executeActiveConversationExtension, resetConversationExtensionTurnCacheForTests } from "../active-conversation-extension";

describe("production command through active extension entry point", () => {
  afterEach(() => { resetConversationExtensionTurnCacheForTests(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it("routes yeni üretim emri oluştur to the production create surface", async () => {
    vi.stubGlobal("window", { location: { pathname: "/" } });
    const result = await executeActiveConversationExtension({ utterance: "yeni üretim emri oluştur", source: "written", turnKey: "production-create-active" });
    expect(result.handoff).toMatchObject({ outcomeCode: "PRODUCTION_CREATE_OPENED" });
  });
});
