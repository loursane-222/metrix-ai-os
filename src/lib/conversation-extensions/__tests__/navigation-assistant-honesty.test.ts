import { describe, expect, it } from "vitest";
import { resolveNavigationAssistantContent, type ExecutiveNavigationCompletion } from "../executive-navigation-command";

const completion = (status: ExecutiveNavigationCompletion["status"]): ExecutiveNavigationCompletion => ({
  status,
  changedExecutiveTargetIds: [],
});

describe("navigation assistant honesty", () => {
  it.each(["FAILED", "EXPIRED", "SUPERSEDED"] as const)("blocks success copy for %s navigation", (status) => {
    const content = resolveNavigationAssistantContent("Atlas İnşaat müşterisini açtım.", completion(status));
    expect(content).not.toMatch(/açtım|açıldı|hazır/iu);
    expect(content).toContain("açamadım");
  });

  it("allows canonical success copy only for visible-ready completion", () => {
    expect(resolveNavigationAssistantContent("Atlas İnşaat müşterisini açtım.", completion("COMPLETED")))
      .toBe("Atlas İnşaat müşterisini açtım.");
  });

  it("does not alter ordinary non-navigation responses", () => {
    expect(resolveNavigationAssistantContent("Size nasıl yardımcı olabilirim?", null))
      .toBe("Size nasıl yardımcı olabilirim?");
  });
});
