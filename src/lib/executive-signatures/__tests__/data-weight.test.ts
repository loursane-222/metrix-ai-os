import { describe, expect, it } from "vitest";
import { resolveDataWeight } from "../data-weight";

describe("verinin.agirligi", () => {
  it("stays inactive when no real SalesGoal threshold exists", () => expect(resolveDataWeight(900, null)).toBe("inactive"));
  it("activates at ninety percent without blocking an overage", () => {
    expect(resolveDataWeight(900, 1000)).toBe("approaching");
    expect(resolveDataWeight(1100, 1000)).toBe("exceeded");
  });
});
