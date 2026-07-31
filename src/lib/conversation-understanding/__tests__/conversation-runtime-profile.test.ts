import { describe, expect, it } from "vitest";
import { resolveConversationRuntime } from "../conversation-runtime-profile";
import { resolveTextResponseReadiness } from "../text-response-readiness";

function resolve(message: string) {
  const readiness = resolveTextResponseReadiness(message);
  return resolveConversationRuntime({ readiness });
}

describe("conversation-first runtime profiles", () => {
  it("routes simple conversation directly to minimal context", () => {
    const result = resolve("Bugün nasılsın?");
    expect(result.contextProfile).toBe("conversational_minimal");
  });

  it("selects the company-analysis context profile without owning understanding", () => {
    const result = resolve("Şirketimin mevcut durumunu analiz et.");
    expect(result.contextProfile).toBe("executive_analysis");
    expect(result).not.toHaveProperty("understanding");
  });

  it("routes entity lookup to light business context", () => {
    const result = resolve("Atlas müşterisinin durumunu söyle.");
    expect(result.contextProfile).toBe("business_light");
  });

  it("keeps explicit mutation requests on the action profile", () => {
    const result = resolve("Atlas müşterisini pasif yap.");
    expect(result.contextProfile).toBe("action_execution");
  });
});
