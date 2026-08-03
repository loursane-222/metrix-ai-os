import { describe, expect, it } from "vitest";
import { resolveCreatePlan } from "../create-plan-resolution";

type FakePlan = { kind: "CREATE_PLAN"; fields: Record<string, string> } | { kind: "CANCEL" };

describe("resolveCreatePlan — shared planner-failure contract", () => {
  it("reports PLANNER source when the real planner succeeds", async () => {
    const resolution = await resolveCreatePlan<FakePlan>({
      callPlanner: async () => ({ kind: "CREATE_PLAN", fields: { title: "Ofis kirasını öde" } }),
      deterministicFallback: () => ({ kind: "CREATE_PLAN", fields: {} }),
      countReliableFields: (plan) => plan.kind === "CREATE_PLAN" ? Object.keys(plan.fields).length : null,
    });
    expect(resolution).toMatchObject({ source: "PLANNER" });
  });

  // Regression: this is the exact production incident (customer-create,
  // 401 session expiry mid-call) — planner throws, deterministic fallback
  // extracts nothing reliable. Must be distinguishable from a genuine
  // successful-but-empty planner result, never silently equivalent to it.
  it("reports FALLBACK_EMPTY when the planner fails and the fallback extracts nothing", async () => {
    const resolution = await resolveCreatePlan<FakePlan>({
      callPlanner: async () => { throw new Error("PLANNER_FAILED"); },
      deterministicFallback: () => ({ kind: "CREATE_PLAN", fields: {} }),
      countReliableFields: (plan) => plan.kind === "CREATE_PLAN" ? Object.keys(plan.fields).length : null,
    });
    expect(resolution).toMatchObject({ source: "FALLBACK_EMPTY", plannerFailureReason: "PLANNER_FAILED" });
  });

  it("reports FALLBACK_USABLE when the planner fails but the fallback extracted real fields", async () => {
    const resolution = await resolveCreatePlan<FakePlan>({
      callPlanner: async () => { throw new Error("PLANNER_FAILED"); },
      deterministicFallback: () => ({ kind: "CREATE_PLAN", fields: { phone: "5551234567" } }),
      countReliableFields: (plan) => plan.kind === "CREATE_PLAN" ? Object.keys(plan.fields).length : null,
    });
    expect(resolution).toMatchObject({ source: "FALLBACK_USABLE", reliableFieldCount: 1, plannerFailureReason: "PLANNER_FAILED" });
  });

  it("reports FALLBACK_USABLE (not EMPTY) when the fallback confidently classifies a non-field plan kind", async () => {
    const resolution = await resolveCreatePlan<FakePlan>({
      callPlanner: async () => { throw new Error("PLANNER_FAILED"); },
      deterministicFallback: () => ({ kind: "CANCEL" }),
      countReliableFields: (plan) => plan.kind === "CREATE_PLAN" ? Object.keys(plan.fields).length : null,
    });
    expect(resolution).toMatchObject({ source: "FALLBACK_USABLE", reliableFieldCount: null });
  });

  it("never leaks raw error content into plannerFailureReason", async () => {
    const resolution = await resolveCreatePlan<FakePlan>({
      callPlanner: async () => { throw new Error("unexpected token < in JSON at position 0, body: Bearer eyJhbGci..."); },
      deterministicFallback: () => ({ kind: "CREATE_PLAN", fields: {} }),
      countReliableFields: (plan) => plan.kind === "CREATE_PLAN" ? Object.keys(plan.fields).length : null,
    });
    expect(resolution).toMatchObject({ source: "FALLBACK_EMPTY", plannerFailureReason: "UNKNOWN_PLANNER_FAILURE" });
  });
});
