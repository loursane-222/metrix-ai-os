import { describe, expect, it } from "vitest";

import { buildFirstExperienceOpeningPlan, isFirstExperienceActive, shouldCompleteAfterNormalTurn, shouldDeliverOpening } from "../first-experience.policy";

const state = (organizationStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED", membershipRole: "OWNER" | "EMPLOYEE" = "OWNER") => ({ organizationStatus, organizationStep: null, membershipRole });

describe("first experience lifecycle policy", () => {
  it("requires one server opening only for a NOT_STARTED owner organization", () => {
    expect(shouldDeliverOpening(state("NOT_STARTED"))).toBe(true);
    expect(shouldDeliverOpening(state("IN_PROGRESS"))).toBe(false);
    expect(shouldDeliverOpening(state("COMPLETED"))).toBe(false);
    expect(shouldDeliverOpening(state("NOT_STARTED", "EMPLOYEE"))).toBe(false);
  });

  it("never treats lifecycle as an access gate", () => {
    expect(isFirstExperienceActive(state("IN_PROGRESS"))).toBe(true);
    expect(shouldCompleteAfterNormalTurn(state("IN_PROGRESS"))).toBe(true);
    expect(shouldCompleteAfterNormalTurn(state("COMPLETED"))).toBe(false);
  });

  it("builds a short identity-compatible deterministic opening plan", () => {
    const plan = buildFirstExperienceOpeningPlan("Murat");
    expect(plan.content).toContain("Hoş geldiniz Murat");
    expect(plan.content).toContain("AI Genel Müdürüyüm");
    expect(plan.content).toContain("şirketinizi");
    expect(plan.metadata.kind).toBe("first_experience_welcome");
  });
});
