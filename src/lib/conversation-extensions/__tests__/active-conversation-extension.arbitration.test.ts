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
});
