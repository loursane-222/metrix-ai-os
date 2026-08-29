import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  parseRepRequestReviewMock,
  listActiveNotificationRecipientRecordsMock,
  findPendingRepRequestCandidatesMock,
  decideBusinessCandidateChangesMock,
  promoteBusinessCandidateMock,
  createBusinessCandidateActionRuntimeExecutorMock,
  buildAuthContextForOrganizationMemberMock,
  notifyMock,
} = vi.hoisted(() => ({
  parseRepRequestReviewMock: vi.fn(),
  listActiveNotificationRecipientRecordsMock: vi.fn(),
  findPendingRepRequestCandidatesMock: vi.fn(),
  decideBusinessCandidateChangesMock: vi.fn(),
  promoteBusinessCandidateMock: vi.fn(),
  createBusinessCandidateActionRuntimeExecutorMock: vi.fn(),
  buildAuthContextForOrganizationMemberMock: vi.fn(),
  notifyMock: vi.fn(),
}));

vi.mock("../rep-request-review-parser.service", () => ({ parseRepRequestReview: parseRepRequestReviewMock }));
vi.mock("@/lib/core/organization-members/organization-member.repository", () => ({
  listActiveNotificationRecipientRecords: listActiveNotificationRecipientRecordsMock,
}));
vi.mock("@/lib/business-reality-candidates", () => ({
  decideBusinessCandidateChanges: decideBusinessCandidateChangesMock,
  promoteBusinessCandidate: promoteBusinessCandidateMock,
  createBusinessCandidateActionRuntimeExecutor: createBusinessCandidateActionRuntimeExecutorMock,
}));
vi.mock("@/lib/auth/context/auth-context-for-member", () => ({
  buildAuthContextForOrganizationMember: buildAuthContextForOrganizationMemberMock,
}));
vi.mock("@/lib/core/notifications/notification.service", () => ({ notify: notifyMock }));
// Real (pure) label/lookup helpers reimplemented here rather than via
// importOriginal — the real module also imports prisma (for the DB query
// this test replaces), which throws without DATABASE_URL at import time.
vi.mock("../rep-request.repository", () => ({
  findPendingRepRequestCandidates: findPendingRepRequestCandidatesMock,
  repRequestDomainForTargetDomain: (targetDomain: string) => ({ Order: "ORDER", Quote: "QUOTE", Payment: "PAYMENT" })[targetDomain] ?? null,
  repRequestDomainLabel: (domain: string) => ({ ORDER: "Sipariş", QUOTE: "Teklif", PAYMENT: "Tahsilat" })[domain],
  customerNameRawFromChanges: (changes: readonly { fieldPath: string; proposedValue: unknown }[]) => {
    const change = changes.find((item) => item.fieldPath === "customerNameRaw");
    return typeof change?.proposedValue === "string" ? change.proposedValue : null;
  },
}));

import { reviewRepRequest } from "../rep-request-review-orchestrator.service";

const authContext = (role: string, userId = "user-1", fullName: string | null = "Murat Arda") => ({
  user: { id: userId, fullName },
  organization: { id: "org-1" },
  membership: { role },
} as never);

function orderCandidate(overrides: Partial<{ id: string; changes: { id: string; fieldPath: string; proposedValue: unknown }[] }> = {}) {
  return {
    id: overrides.id ?? "candidate-1",
    targetDomain: "Order",
    changes: overrides.changes ?? [
      { id: "change-1", fieldPath: "customerId", proposedValue: "customer-1" },
      { id: "change-2", fieldPath: "customerNameRaw", proposedValue: "Atlas İnşaat" },
    ],
  };
}

describe("reviewRepRequest", () => {
  beforeEach(() => {
    parseRepRequestReviewMock.mockReset();
    listActiveNotificationRecipientRecordsMock.mockReset().mockResolvedValue([]);
    findPendingRepRequestCandidatesMock.mockReset();
    decideBusinessCandidateChangesMock.mockReset().mockResolvedValue({});
    promoteBusinessCandidateMock.mockReset().mockResolvedValue({});
    createBusinessCandidateActionRuntimeExecutorMock.mockReset().mockReturnValue(vi.fn());
    buildAuthContextForOrganizationMemberMock.mockReset().mockResolvedValue({ user: { id: "user-1" }, organization: { id: "org-1" }, membership: { role: "EMPLOYEE" }, session: {} });
    notifyMock.mockReset().mockResolvedValue({});
  });

  it("denies a plain EMPLOYEE from reviewing any request, without even parsing", async () => {
    const result = await reviewRepRequest({ authContext: authContext("EMPLOYEE"), message: "Ahmet'in siparişini onayla" });
    expect(result).toEqual({ status: "DENIED" });
    expect(parseRepRequestReviewMock).not.toHaveBeenCalled();
  });

  it("returns PARSE_FAILED when the message isn't a clear decision", async () => {
    parseRepRequestReviewMock.mockResolvedValue(null);
    const result = await reviewRepRequest({ authContext: authContext("MANAGER"), message: "talepler nasıl gidiyor" });
    expect(result).toEqual({ status: "PARSE_FAILED" });
  });

  it("returns REP_NOT_FOUND without touching any candidate when the name doesn't match", async () => {
    parseRepRequestReviewMock.mockResolvedValue({ repNameRaw: "Bilinmeyen Kişi", decision: "APPROVE", domain: null, entityReference: null });
    const result = await reviewRepRequest({ authContext: authContext("MANAGER"), message: "x" });
    expect(result).toEqual({ status: "REP_NOT_FOUND" });
    expect(findPendingRepRequestCandidatesMock).not.toHaveBeenCalled();
  });

  it("returns NO_PENDING_REQUEST when the rep has nothing pending", async () => {
    parseRepRequestReviewMock.mockResolvedValue({ repNameRaw: "kendi", decision: "APPROVE", domain: null, entityReference: null });
    findPendingRepRequestCandidatesMock.mockResolvedValue([]);
    const result = await reviewRepRequest({ authContext: authContext("MANAGER", "user-1", "Murat Arda"), message: "kendi talebimi onayla" });
    expect(result).toEqual({ status: "NO_PENDING_REQUEST", repFullName: "Murat Arda" });
  });

  it("falls back to the domain-filtered set when entityReference matches nothing (e.g. LLM captured a month, not a customer name) — live-verification regression", async () => {
    parseRepRequestReviewMock.mockResolvedValue({ repNameRaw: "kendi", decision: "APPROVE", domain: "PAYMENT", entityReference: "Eylül" });
    findPendingRepRequestCandidatesMock.mockResolvedValue([
      { id: "c1", targetDomain: "Payment", changes: [{ id: "change-1", fieldPath: "customerNameRaw", proposedValue: "Atlas İnşaat" }] },
    ]);
    const result = await reviewRepRequest({ authContext: authContext("MANAGER", "user-1", "Murat Arda"), message: "kendi Eylül tahsilatımı onayla" });
    expect(result).toMatchObject({ status: "DECIDED", domain: "PAYMENT" });
    expect(decideBusinessCandidateChangesMock).toHaveBeenCalledWith(expect.objectContaining({ candidateId: "c1" }));
  });

  it("returns CANDIDATE_AMBIGUOUS when the rep has more than one pending request and no domain/entity narrows it", async () => {
    parseRepRequestReviewMock.mockResolvedValue({ repNameRaw: "kendi", decision: "APPROVE", domain: null, entityReference: null });
    findPendingRepRequestCandidatesMock.mockResolvedValue([orderCandidate({ id: "c1" }), orderCandidate({ id: "c2" })]);
    const result = await reviewRepRequest({ authContext: authContext("MANAGER"), message: "kendi talebimi onayla" });
    expect(result.status).toBe("CANDIDATE_AMBIGUOUS");
    expect(decideBusinessCandidateChangesMock).not.toHaveBeenCalled();
  });

  it("narrows an ambiguous set down to one using domain + entityReference", async () => {
    parseRepRequestReviewMock.mockResolvedValue({ repNameRaw: "kendi", decision: "APPROVE", domain: "ORDER", entityReference: "Atlas" });
    findPendingRepRequestCandidatesMock.mockResolvedValue([
      orderCandidate({ id: "c1" }),
      { id: "c2", targetDomain: "Payment", changes: [{ id: "change-3", fieldPath: "customerNameRaw", proposedValue: "Beta Lojistik" }] },
    ]);
    const result = await reviewRepRequest({ authContext: authContext("MANAGER", "user-1", "Murat Arda"), message: "kendi Atlas siparişimi onayla" });
    expect(result).toMatchObject({ status: "DECIDED", domain: "ORDER" });
    expect(decideBusinessCandidateChangesMock).toHaveBeenCalledWith(expect.objectContaining({ candidateId: "c1" }));
  });

  it("approves: decides with all change ids approved, promotes under the proposer's identity, and notifies the rep", async () => {
    parseRepRequestReviewMock.mockResolvedValue({ repNameRaw: "kendi", decision: "APPROVE", domain: null, entityReference: null });
    findPendingRepRequestCandidatesMock.mockResolvedValue([orderCandidate()]);

    const result = await reviewRepRequest({ authContext: authContext("MANAGER", "manager-1", "Yönetici"), message: "kendi siparişimi onayla" });

    expect(decideBusinessCandidateChangesMock).toHaveBeenCalledWith({
      organizationId: "org-1", candidateId: "candidate-1", actorUserId: "manager-1",
      approvedChangeIds: ["change-1", "change-2"], rejectedChangeIds: [], reason: "REP_REQUEST_DECISION",
    });
    expect(buildAuthContextForOrganizationMemberMock).toHaveBeenCalledWith("manager-1", "org-1");
    expect(createBusinessCandidateActionRuntimeExecutorMock).toHaveBeenCalledWith(expect.anything(), ["orders.write", "quotes.write", "payments.write"]);
    expect(promoteBusinessCandidateMock).toHaveBeenCalledWith(expect.objectContaining({ candidateId: "candidate-1", actorUserId: "manager-1" }));
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: "manager-1", type: "REP_REQUEST_REVIEWED", title: "Sipariş talebin onaylandı" }));
    expect(result).toEqual({ status: "DECIDED", decision: "APPROVE", domain: "ORDER", repFullName: "Yönetici", customerNameRaw: "Atlas İnşaat" });
  });

  it("rejects: decides with all change ids rejected and never promotes", async () => {
    parseRepRequestReviewMock.mockResolvedValue({ repNameRaw: "kendi", decision: "REJECT", domain: null, entityReference: null });
    findPendingRepRequestCandidatesMock.mockResolvedValue([orderCandidate()]);

    await reviewRepRequest({ authContext: authContext("MANAGER"), message: "kendi siparişimi reddet" });

    expect(decideBusinessCandidateChangesMock).toHaveBeenCalledWith(expect.objectContaining({ approvedChangeIds: [], rejectedChangeIds: ["change-1", "change-2"] }));
    expect(promoteBusinessCandidateMock).not.toHaveBeenCalled();
  });

  it("allows a TEAM_LEAD and an OWNER, not just MANAGER", async () => {
    parseRepRequestReviewMock.mockResolvedValue({ repNameRaw: "kendi", decision: "APPROVE", domain: null, entityReference: null });
    findPendingRepRequestCandidatesMock.mockResolvedValue([orderCandidate()]);
    const teamLead = await reviewRepRequest({ authContext: authContext("TEAM_LEAD"), message: "x" });
    findPendingRepRequestCandidatesMock.mockResolvedValue([orderCandidate()]);
    const owner = await reviewRepRequest({ authContext: authContext("OWNER"), message: "x" });
    expect(teamLead.status).toBe("DECIDED");
    expect(owner.status).toBe("DECIDED");
  });
});
