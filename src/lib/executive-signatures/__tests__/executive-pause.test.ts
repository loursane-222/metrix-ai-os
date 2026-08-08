import { describe, expect, it } from "vitest";
import { resolveExecutivePause } from "../executive-pause";

describe("executive.pause", () => {
  it("does not invent a pause without calibration", () => {
    expect(resolveExecutivePause(null)).toMatchObject({ band: "immediate", delayMs: 0 });
  });

  it("maps medium decisions to the management band", () => {
    expect(resolveExecutivePause({ primaryDecision: { category: "OPERATIONS", priority: "MEDIUM", confidence: .8 }, supportingDecisions: [] })).toMatchObject({ band: "management", delayMs: 450 });
  });

  it("requires both high priority and a risk category for the strategic band", () => {
    expect(resolveExecutivePause({ primaryDecision: { category: "CASH_FLOW_RISK", priority: "HIGH", confidence: .9 }, supportingDecisions: [] })).toMatchObject({ band: "strategic", delayMs: 900 });
  });
});
