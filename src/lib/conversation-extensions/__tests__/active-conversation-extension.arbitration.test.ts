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
// execution path for and reporting OBSERVED, which used to be a final
// HANDOFF blocking the real generic-orchestration fallback from ever
// running. Mocking the real orchestrationConversationExtension module (not
// a fake) keeps this tied to its actual, last position in the production
// `extensions` array.
const { orchestrationExecuteMock, orchestrationScopeKeyMock } = vi.hoisted(() => ({
  orchestrationExecuteMock: vi.fn(),
  orchestrationScopeKeyMock: vi.fn(),
}));

vi.mock("../orchestration-conversation-extension", () => ({
  orchestrationConversationExtension: {
    execute: orchestrationExecuteMock,
    getActiveScopeKey: orchestrationScopeKeyMock,
  },
}));

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
    orchestrationScopeKeyMock.mockReturnValue("orchestration:test");
    orchestrationExecuteMock.mockResolvedValue({ status: "NOT_HANDLED", handoff: null });
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

  // Universal Semantic Authority regression: a legacy extension's weak,
  // non-executing OBSERVED claim on an actionable mutation must not swallow
  // the turn before the generic orchestration fallback (registered last in
  // production, mocked here as the real module) gets a chance to execute
  // it for real. Reproduces the exact production incident: "Atlas'ın
  // telefonunu 0532 444 55 66 yap." — the customer-create coordinator
  // recognizes this as an UPDATE it cannot itself execute and reports
  // OBSERVED with mutationPerformed: false.
  const weakCustomerObservedHandoff = {
    domain: "customers", operation: "UPDATE", outcomeCode: "CANONICAL_CUSTOMER_EVIDENCE", resultStatus: "OBSERVED",
    entityResolution: "PRESENT", fieldNames: ["phone"], fieldCount: 1, mutationPerformed: false,
    navigationRequested: false, navigationStatus: "NOT_REQUESTED", failureCode: null, approvalRequired: false,
    certainty: "CERTAIN", captureOutcome: "FIELDS_CAPTURED", entityId: null, entityDisplayName: null, entityDomain: "customers",
  } as const;

  it("does not let a weak OBSERVED claim on an unexecuted UPDATE stop the loop before the generic orchestration fallback executes the real mutation", async () => {
    customerExecuteMock.mockResolvedValue({ status: "HANDOFF", handoff: weakCustomerObservedHandoff });
    teamExecuteMock.mockResolvedValue({ status: "NOT_HANDLED", handoff: null });
    const executedHandoff = {
      domain: "customers", operation: "UPDATE", outcomeCode: "ORCHESTRATION_COMPLETED", resultStatus: "EXECUTED",
      entityResolution: "RESOLVED", fieldNames: [], fieldCount: 0, mutationPerformed: true,
      navigationRequested: false, navigationStatus: "NOT_REQUESTED", failureCode: null, approvalRequired: false,
      certainty: "CERTAIN", captureOutcome: "NONE", entityId: "customer-atlas", entityDisplayName: "Atlas", entityDomain: "customers",
    };
    orchestrationExecuteMock.mockResolvedValue({ status: "HANDOFF", handoff: executedHandoff });

    const result = await executeActiveConversationExtension({ utterance: "Atlas'ın telefonunu 0532 444 55 66 yap.", source: "written", turnKey: "arbitration-3" });

    expect(customerExecuteMock).toHaveBeenCalledTimes(1);
    expect(teamExecuteMock).toHaveBeenCalledTimes(1);
    expect(orchestrationExecuteMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: "HANDOFF", handoff: executedHandoff, duplicate: false });
  });

  it("falls back to the weak OBSERVED claim when nothing later — including the generic orchestration fallback — actually claims the turn", async () => {
    customerExecuteMock.mockResolvedValue({ status: "HANDOFF", handoff: weakCustomerObservedHandoff });
    teamExecuteMock.mockResolvedValue({ status: "NOT_HANDLED", handoff: null });
    orchestrationExecuteMock.mockResolvedValue({ status: "NOT_HANDLED", handoff: null });

    const result = await executeActiveConversationExtension({ utterance: "Atlas'ın telefonunu 0532 444 55 66 yap.", source: "written", turnKey: "arbitration-4" });

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
    expect(orchestrationExecuteMock).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "HANDOFF", handoff: queryHandoff, duplicate: false });
  });
});
