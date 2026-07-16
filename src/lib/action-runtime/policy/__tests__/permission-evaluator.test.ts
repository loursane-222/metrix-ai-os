import { describe, expect, it } from "vitest";

import { evaluatePermissions } from "../permission-evaluator";

describe("evaluatePermissions", () => {
  it("is satisfied when the actor has every required permission", () => {
    const result = evaluatePermissions(["customers.write"], ["customers.write", "customers.read"]);

    expect(result.satisfied).toBe(true);
    expect(result.missingPermissions).toEqual([]);
  });

  it("reports missing permissions deterministically", () => {
    const result = evaluatePermissions(["customers.write", "customers.archive"], ["customers.write"]);

    expect(result.satisfied).toBe(false);
    expect(result.missingPermissions).toEqual(["customers.archive"]);
  });

  it("is satisfied when no permissions are required", () => {
    expect(evaluatePermissions([], []).satisfied).toBe(true);
  });

  it("does not treat any role as a substitute for permissions", () => {
    // evaluatePermissions has no role parameter at all — this is a
    // structural guarantee, not a runtime check.
    const result = evaluatePermissions(["customers.archive"], []);

    expect(result.satisfied).toBe(false);
  });
});
