import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const routeSource = readFileSync(new URL("../route.ts", import.meta.url), "utf8");

describe("chat single-authority source contract", () => {
  it("does not persist or return the gap detector's fixed question", () => {
    expect(routeSource).not.toContain("gapResult.criticalQuestion");
    expect(routeSource).not.toContain('"gap_intercept"');
    expect(routeSource).toContain("streamWithAiGateway");
  });

  it("does not connect keyword detectors directly to lifecycle mutations", () => {
    expect(routeSource).not.toContain("applyCollectionActionLifecycle");
    expect(routeSource).not.toContain("applyQuoteWorkflowLifecycle");
    expect(routeSource).not.toContain("completeExecutiveAction");
  });
});
