import { describe, expect, it } from "vitest";
import { tryFastPathClassification } from "../conversation-fast-path";
import { resolveConversationRuntime } from "../conversation-runtime-profile";
import { resolveTextResponseReadiness } from "../text-response-readiness";

function resolve(message: string) {
  const readiness = resolveTextResponseReadiness(message);
  const fastPath = tryFastPathClassification(message);
  return resolveConversationRuntime({
    readiness,
    fastPathUnderstanding: fastPath.matched ? fastPath.understanding : null,
  });
}

describe("conversation-first runtime profiles", () => {
  it("routes simple conversation directly to minimal context", () => {
    const result = resolve("Bugün nasılsın?");
    expect(result.contextProfile).toBe("conversational_minimal");
    expect(result.understanding.shouldInvokeExecutiveBrain).toBe(false);
  });

  it("routes company analysis without an LLM classification dependency", () => {
    const result = resolve("Şirketimin mevcut durumunu analiz et.");
    expect(result.contextProfile).toBe("executive_analysis");
    expect(result.understanding.shouldInvokeExecutiveBrain).toBe(true);
  });

  it("routes entity lookup to light business context", () => {
    const result = resolve("Atlas müşterisinin durumunu söyle.");
    expect(result.contextProfile).toBe("business_light");
    expect(result.understanding.actionExpectation).toBe("none");
  });

  it("keeps explicit mutation requests on the action profile", () => {
    const result = resolve("Atlas müşterisini pasif yap.");
    expect(result.contextProfile).toBe("action_execution");
    expect(result.understanding.actionExpectation).toBe("explicit");
  });
});
