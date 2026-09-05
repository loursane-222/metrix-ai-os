import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Reproduces the real historical incident this rule fixes: an earlier,
// over-broad domain extension (customer-management) briefly claimed a
// team-domain role-change turn via a NOT_FOUND-driven clarification instead
// of declining, pre-empting the later (correct) team extension in the same
// fixed-order array. Mocking these two specific, real modules (not fakes)
// keeps the test tied to the actual production ordering in
// active-conversation-extension.ts's `extensions` array, where
// customerManagementConversationExtension really does run before
// teamManagementConversationExtension.
const { customerExecuteMock, customerScopeKeyMock, teamExecuteMock, teamScopeKeyMock } = vi.hoisted(() => ({
  customerExecuteMock: vi.fn(),
  customerScopeKeyMock: vi.fn(),
  teamExecuteMock: vi.fn(),
  teamScopeKeyMock: vi.fn(),
}));

vi.mock("../customer-management-conversation-extension", () => ({
  customerManagementConversationExtension: {
    execute: customerExecuteMock,
    getActiveScopeKey: customerScopeKeyMock,
  },
}));

vi.mock("../team-management-conversation-extension", () => ({
  teamManagementConversationExtension: {
    execute: teamExecuteMock,
    getActiveScopeKey: teamScopeKeyMock,
  },
}));

// Second incident this same shared rule fixes (see
// isProvisionalConversationHandoff, conversation-extension-handoff.ts): the
// customer-create coordinator recognizing an actionable UPDATE it has no
// execution path for and reporting OBSERVED. This used to be a final
// HANDOFF blocked only by the generic-orchestration fallback (retired —
// see Legacy Conversation Ownership & Dangling Stream Closure; it is no
// longer registered in the real `extensions` array, so it is not mocked
// here anymore either) getting a chance to execute it for real. Now the
// weak claim always falls through as the provisional final answer — see
// the dedicated test below.
import {
  executeActiveConversationExtension,
  resetConversationExtensionTurnCacheForTests,
} from "../active-conversation-extension";

const teamHandoff = {
  domain: "team", operation: "UPDATE", outcomeCode: "TEAM_MEMBER_ROLE_CHANGED", resultStatus: "EXECUTED",
  entityResolution: "RESOLVED", fieldNames: [], fieldCount: 0, mutationPerformed: true,
  navigationRequested: false, navigationStatus: "NOT_REQUESTED", failureCode: null, approvalRequired: false,
  certainty: "CERTAIN", captureOutcome: "NONE", entityId: "member-1", entityDisplayName: "Ayşe", entityDomain: "team",
};

describe("executeActiveConversationExtension — shared arbitration", () => {
  beforeEach(() => {
    customerScopeKeyMock.mockReturnValue("customers-management:test");
    teamScopeKeyMock.mockReturnValue("team-management:test");
    teamExecuteMock.mockResolvedValue({ status: "HANDOFF", handoff: teamHandoff });
  });

  afterEach(() => {
    resetConversationExtensionTurnCacheForTests();
    vi.clearAllMocks();
  });

  it("lets the correct later owner claim a turn an earlier domain's entity resolution came back NOT_FOUND for", async () => {
    customerExecuteMock.mockResolvedValue({
      status: "HANDOFF",
      handoff: {
        domain: "customers", operation: "UPDATE", outcomeCode: "CUSTOMER_UPDATE_HANDLED_CLARIFICATION", resultStatus: "CLARIFICATION_REQUIRED",
        entityResolution: "NOT_FOUND", fieldNames: [], fieldCount: 0, mutationPerformed: false,
        navigationRequested: false, navigationStatus: "NOT_REQUESTED", failureCode: null, approvalRequired: false,
        certainty: "CERTAIN", captureOutcome: "NONE", entityId: null, entityDisplayName: null, entityDomain: "customers",
      },
    });

    const result = await executeActiveConversationExtension({ utterance: "Ayşe'nin rolünü ekip lideri yap", source: "written", turnKey: "arbitration-1" });

    expect(customerExecuteMock).toHaveBeenCalledTimes(1);
    expect(teamExecuteMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: "HANDOFF", handoff: teamHandoff, duplicate: false });
  });

  it("falls back to the provisional NOT_FOUND clarification when nothing later actually claims the turn", async () => {
    const notFoundHandoff = {
      domain: "customers", operation: "UPDATE", outcomeCode: "CUSTOMER_UPDATE_HANDLED_CLARIFICATION", resultStatus: "CLARIFICATION_REQUIRED",
      entityResolution: "NOT_FOUND", fieldNames: [], fieldCount: 0, mutationPerformed: false,
      navigationRequested: false, navigationStatus: "NOT_REQUESTED", failureCode: null, approvalRequired: false,
      certainty: "CERTAIN", captureOutcome: "NONE", entityId: null, entityDisplayName: null, entityDomain: "customers",
    };
    customerExecuteMock.mockResolvedValue({ status: "HANDOFF", handoff: notFoundHandoff });
    teamExecuteMock.mockResolvedValue({ status: "NOT_HANDLED", handoff: null });

    const result = await executeActiveConversationExtension({ utterance: "Bilinmeyen Firma'nın telefonu 555 olsun", source: "written", turnKey: "arbitration-fallback" });

    expect(result).toEqual({ status: "HANDOFF", handoff: notFoundHandoff, duplicate: false });
  });

  it("does NOT continue past a genuinely ambiguous claim from the correct domain (AMBIGUOUS, not NOT_FOUND)", async () => {
    const ambiguousHandoff = {
      domain: "customers", operation: "UPDATE", outcomeCode: "CUSTOMER_UPDATE_HANDLED_CLARIFICATION", resultStatus: "CLARIFICATION_REQUIRED",
      entityResolution: "AMBIGUOUS", fieldNames: [], fieldCount: 0, mutationPerformed: false,
      navigationRequested: false, navigationStatus: "NOT_REQUESTED", failureCode: null, approvalRequired: false,
      certainty: "CERTAIN", captureOutcome: "NONE", entityId: null, entityDisplayName: null, entityDomain: "customers",
    };
    customerExecuteMock.mockResolvedValue({ status: "HANDOFF", handoff: ambiguousHandoff });

    const result = await executeActiveConversationExtension({ utterance: "Atlas'ın telefonu 555 olsun", source: "written", turnKey: "arbitration-2" });

    expect(customerExecuteMock).toHaveBeenCalledTimes(1);
    expect(teamExecuteMock).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "HANDOFF", handoff: ambiguousHandoff, duplicate: false });
  });

  // Legacy Conversation Ownership & Dangling Stream Closure: the generic
  // orchestration fallback (previously registered last in production) has
  // been retired as an independent semantic/write owner — it is no longer
  // in the real `extensions` array at all, so it is deliberately not
  // mocked or imported here anymore. A legacy extension's weak, non-
  // executing OBSERVED claim on an actionable mutation (the customer-create
  // coordinator recognizing "Atlas'ın telefonunu 0532 444 55 66 yap." as an
  // UPDATE it cannot itself execute) therefore always falls through as the
  // provisional last-resort answer now — there is nothing left in this
  // array to execute it for real. route.ts's authoritativeConversationExtensionHandoff
  // (via isProvisionalConversationHandoff) treats exactly this shape as
  // non-authoritative, so the turn still reaches the METRIX Executive
  // Agent instead of dead-ending on an inconclusive claim.
  const weakCustomerObservedHandoff = {
    domain: "customers", operation: "UPDATE", outcomeCode: "CANONICAL_CUSTOMER_EVIDENCE", resultStatus: "OBSERVED",
    entityResolution: "PRESENT", fieldNames: ["phone"], fieldCount: 1, mutationPerformed: false,
    navigationRequested: false, navigationStatus: "NOT_REQUESTED", failureCode: null, approvalRequired: false,
    certainty: "CERTAIN", captureOutcome: "FIELDS_CAPTURED", entityId: null, entityDisplayName: null, entityDomain: "customers",
  } as const;

  it("falls back to the weak OBSERVED claim as the final answer — nothing in the array executes it anymore", async () => {
    customerExecuteMock.mockResolvedValue({ status: "HANDOFF", handoff: weakCustomerObservedHandoff });
    teamExecuteMock.mockResolvedValue({ status: "NOT_HANDLED", handoff: null });

    const result = await executeActiveConversationExtension({ utterance: "Atlas'ın telefonunu 0532 444 55 66 yap.", source: "written", turnKey: "arbitration-4" });

    expect(customerExecuteMock).toHaveBeenCalledTimes(1);
    expect(teamExecuteMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: "HANDOFF", handoff: weakCustomerObservedHandoff, duplicate: false });
  });

  it("does NOT treat an OBSERVED query answer as a provisional claim — it wins immediately, the generic fallback never runs", async () => {
    const queryHandoff = {
      domain: "customers", operation: "QUERY", outcomeCode: "CUSTOMER_LOOKUP_FOUND", resultStatus: "OBSERVED",
      entityResolution: "RESOLVED", fieldNames: [], fieldCount: 0, mutationPerformed: false,
      navigationRequested: false, navigationStatus: "NOT_REQUESTED", failureCode: null, approvalRequired: false,
      certainty: "CERTAIN", captureOutcome: "NONE", entityId: "customer-atlas", entityDisplayName: "Atlas", entityDomain: "customers",
    };
    customerExecuteMock.mockResolvedValue({ status: "HANDOFF", handoff: queryHandoff });

    const result = await executeActiveConversationExtension({ utterance: "Atlas'ın telefonu ne?", source: "written", turnKey: "arbitration-5" });

    expect(customerExecuteMock).toHaveBeenCalledTimes(1);
    expect(teamExecuteMock).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "HANDOFF", handoff: queryHandoff, duplicate: false });
  });
});
