import { describe, expect, it } from "vitest";
import { customerHandoff, orchestrationHandoff, paymentHandoff, isNavigationBlindHandoff, validateConversationExtensionHandoff } from "../conversation-extension-handoff";

describe("conversation extension handoff — entity continuity fields", () => {
  it("defaults entityDomain to the handoff's own domain when not overridden", () => {
    const handoff = customerHandoff({ operation: "UPDATE", outcomeCode: "TEST", resultStatus: "EXECUTED" });
    expect(handoff.entityDomain).toBe("customers");
    expect(handoff.entityId).toBeNull();
    expect(handoff.entityDisplayName).toBeNull();
  });

  it("lets a caller override entityDomain away from the handoff's own routing domain (e.g. orchestration)", () => {
    const handoff = orchestrationHandoff({ operation: "CREATE", outcomeCode: "ORCHESTRATION_COMPLETED", resultStatus: "EXECUTED", entityId: "supplier-1", entityDomain: "suppliers" });
    expect(handoff.domain).toBe("orchestrations");
    expect(handoff.entityDomain).toBe("suppliers");
    expect(handoff.entityId).toBe("supplier-1");
  });

  it("round-trips the 3 new fields through the client-facing validator", () => {
    const handoff = customerHandoff({ operation: "UPDATE", outcomeCode: "TEST", resultStatus: "EXECUTED", entityId: "cust-1", entityDisplayName: "Atlas Yapı" });
    const validated = validateConversationExtensionHandoff(handoff);
    expect(validated).toMatchObject({ entityId: "cust-1", entityDisplayName: "Atlas Yapı", entityDomain: "customers" });
  });

  it("rejects a malformed entityId from an untrusted client payload", () => {
    const handoff = customerHandoff({ operation: "UPDATE", outcomeCode: "TEST", resultStatus: "EXECUTED" });
    expect(validateConversationExtensionHandoff({ ...handoff, entityId: "<script>alert(1)</script>" })).toBeNull();
  });

  it("rejects an entityDomain not in the closed domain vocabulary", () => {
    const handoff = customerHandoff({ operation: "UPDATE", outcomeCode: "TEST", resultStatus: "EXECUTED" });
    expect(validateConversationExtensionHandoff({ ...handoff, entityDomain: "not-a-real-domain" })).toBeNull();
  });
});

describe("isNavigationBlindHandoff — premature clarification / false navigation success guard", () => {
  it("is true for the general orchestration fallback's own CLARIFICATION_REQUIRED (it has no navigation concept at all)", () => {
    const handoff = orchestrationHandoff({ operation: "QUERY", outcomeCode: "ORCHESTRATION_CLARIFICATION_NEEDED", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "UNKNOWN" });
    expect(isNavigationBlindHandoff(handoff)).toBe(true);
  });

  it("is false for null (no handoff at all)", () => {
    expect(isNavigationBlindHandoff(null)).toBe(false);
  });

  it("is false for an orchestration handoff that actually executed something", () => {
    const handoff = orchestrationHandoff({ operation: "CREATE", outcomeCode: "ORCHESTRATION_COMPLETED", resultStatus: "EXECUTED", mutationPerformed: true });
    expect(isNavigationBlindHandoff(handoff)).toBe(false);
  });

  it("is false for a domain-specific extension's own informed CLARIFICATION_REQUIRED (e.g. an ambiguous customer match)", () => {
    const handoff = customerHandoff({ operation: "UPDATE", outcomeCode: "CUSTOMER_UPDATE_HANDLED_CLARIFICATION", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS", candidateNames: ["Atlas İnşaat", "Atlas Yapı"] });
    expect(isNavigationBlindHandoff(handoff)).toBe(false);
  });

  it("is false for a different domain's own correctly-declining CLARIFICATION_REQUIRED (e.g. payment-reminder) — the original veto's protection is unchanged", () => {
    const handoff = paymentHandoff({ operation: "QUERY", outcomeCode: "PAYMENT_REMINDER_AMBIGUOUS_CUSTOMER", resultStatus: "CLARIFICATION_REQUIRED", entityResolution: "AMBIGUOUS" });
    expect(isNavigationBlindHandoff(handoff)).toBe(false);
  });
});
