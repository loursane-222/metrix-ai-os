import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("../route.ts", import.meta.url), "utf8");

describe("management turn determinism route contract", () => {
  it("resolves management intent before provider classification and never projects Payment navigation for it", () => {
    expect(route.indexOf("recognizeManagementIntent(message)")).toBeLessThan(route.indexOf("classifyConversation({ message, recentMessages })"));
    expect(route).toContain("buildManagementIntentUnderstanding(deterministicManagementIntent)");
    expect(route).toContain("const currentFactEntities = deterministicManagementIntent ? []");
    expect(route).toContain("const canonicalBusinessFacts = deterministicManagementIntent\n      ? []");
    expect(route).toContain("deterministicCollectionPerformanceMessage ?? precomputedDeterministicHandoffMessage");
  });
});
