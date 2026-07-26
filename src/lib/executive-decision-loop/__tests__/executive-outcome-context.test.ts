import { beforeEach, describe, expect, it, vi } from "vitest";

const repositoryMocks = vi.hoisted(() => ({
  findLatestExecutiveDecisionOutcome: vi.fn(),
  listExecutiveDecisionContextRecords: vi.fn(),
}));
const aggregateMocks = vi.hoisted(() => ({
  buildExecutiveDecisionOutcomeAggregate: vi.fn(),
}));

vi.mock("../executive-decision-record.repository", () => repositoryMocks);
vi.mock("../executive-decision-outcome-aggregate.service", () => aggregateMocks);

import { buildExecutiveDecisionContext } from "../executive-decision-context-builder.service";

const decision = {
  id: "decision-1",
  organizationId: "org-1",
  conversationId: "conversation-1",
  sourceMessageId: "message-1",
  aiMessageId: null,
  sourceType: "EXECUTIVE_BRAIN" as const,
  sourceKey: "brain:test",
  sourceSnapshotId: null,
  title: "Tahsilatı tamamla",
  rationale: "Nakit riskini azalt.",
  actionHint: null,
  category: "FINANCE",
  priority: "HIGH",
  status: "CLOSED" as const,
  confidenceScore: 0.9,
  evidenceJson: null,
  sourcePayload: {},
  decisionDate: "2026-07-26",
  committedAt: new Date("2026-07-26T08:00:00.000Z"),
  followUpDueAt: null,
  closedAt: new Date("2026-07-26T10:00:00.000Z"),
  createdAt: new Date("2026-07-26T07:00:00.000Z"),
  updatedAt: new Date("2026-07-26T10:00:00.000Z"),
};

describe("ExecutiveOutcomeV1 decision context projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aggregateMocks.buildExecutiveDecisionOutcomeAggregate.mockResolvedValue(null);
    repositoryMocks.listExecutiveDecisionContextRecords.mockResolvedValue([]);
  });

  it("keeps legacy summary while exposing the same persisted canonical outcome", async () => {
    repositoryMocks.findLatestExecutiveDecisionOutcome.mockResolvedValue({
      id: "outcome-1",
      organizationId: "org-1",
      decisionRecordId: "decision-1",
      conversationId: "conversation-1",
      sourceMessageId: "message-2",
      outcome: "FAILURE",
      summary: "Tahsilat gerçekleşmedi.",
      evidenceJson: null,
      occurredAt: new Date("2026-07-26T10:00:00.000Z"),
      createdAt: new Date("2026-07-26T10:00:00.000Z"),
      decisionRecord: decision,
    });

    const context = await buildExecutiveDecisionContext({
      organizationId: "org-1",
      now: new Date("2026-07-26T10:01:00.000Z"),
    });

    expect(context.latestOutcome).toMatchObject({
      id: "outcome-1",
      outcome: "FAILURE",
      decisionTitle: decision.title,
    });
    expect(context.latestExecutiveOutcome).toMatchObject({
      outcomeId: "outcome-1",
      decisionRecordId: "decision-1",
      status: "NOT_ACHIEVED",
      sourceOutcome: "FAILURE",
      managementImpact: { requiresReagenda: true },
    });
  });

  it("projects a committed decision without outcome as pending", async () => {
    repositoryMocks.findLatestExecutiveDecisionOutcome.mockResolvedValue(null);
    repositoryMocks.listExecutiveDecisionContextRecords.mockResolvedValue([{
      ...decision,
      status: "COMMITTED",
      closedAt: null,
    }]);

    const context = await buildExecutiveDecisionContext({
      organizationId: "org-1",
      now: new Date("2026-07-26T10:01:00.000Z"),
    });

    expect(context.latestOutcome).toBeNull();
    expect(context.latestExecutiveOutcome).toMatchObject({
      status: "PENDING",
      sourceOutcome: "UNAVAILABLE",
    });
  });
});
