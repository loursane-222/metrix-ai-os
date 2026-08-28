import { describe, expect, it } from "vitest";
import { computeExecutionWaves } from "../orchestration-waves";

describe("computeExecutionWaves", () => {
  it("puts every step with no $stepRef into a single wave — fully independent steps run together", () => {
    const waves = computeExecutionWaves([
      { sequence: 1, input: { displayName: "Atlas" } },
      { sequence: 2, input: { title: "Follow up" } },
      { sequence: 3, input: {} },
    ]);
    expect(waves).toEqual([[1, 2, 3]]);
  });

  it("puts a step that references an earlier step one wave after it", () => {
    const waves = computeExecutionWaves([
      { sequence: 1, input: { displayName: "Atlas" } },
      { sequence: 2, input: { customerId: { $stepRef: 0 } } },
    ]);
    expect(waves).toEqual([[1], [2]]);
  });

  it("keeps an unrelated independent step in the earliest wave even alongside a dependency chain", () => {
    // step1 -> step2 (chain), step3 independent of both.
    const waves = computeExecutionWaves([
      { sequence: 1, input: {} },
      { sequence: 2, input: { orderId: { $stepRef: 0 } } },
      { sequence: 3, input: { title: "Unrelated task" } },
    ]);
    expect(waves).toEqual([[1, 3], [2]]);
  });

  it("places a step depending on two different-depth steps one past the deeper dependency", () => {
    // step1 (depth 0) -> step2 (depth 1, depends on step1) ; step3 depends on both step1 and step2 -> depth 2.
    const waves = computeExecutionWaves([
      { sequence: 1, input: {} },
      { sequence: 2, input: { a: { $stepRef: 0 } } },
      { sequence: 3, input: { a: { $stepRef: 0 }, b: { $stepRef: 1 } } },
    ]);
    expect(waves).toEqual([[1], [2], [3]]);
  });

  it("supports genuine fan-out: two independent steps both depending on the same earlier step", () => {
    const waves = computeExecutionWaves([
      { sequence: 1, input: {} },
      { sequence: 2, input: { orderId: { $stepRef: 0 } } },
      { sequence: 3, input: { orderId: { $stepRef: 0 } } },
    ]);
    expect(waves).toEqual([[1], [2, 3]]);
  });

  it("handles a single step", () => {
    expect(computeExecutionWaves([{ sequence: 1, input: {} }])).toEqual([[1]]);
  });

  it("handles an empty plan", () => {
    expect(computeExecutionWaves([])).toEqual([]);
  });
});
