import { describe, expect, it } from "vitest";
import { customerHandoff, orchestrationHandoff, validateConversationExtensionHandoff } from "../conversation-extension-handoff";

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
