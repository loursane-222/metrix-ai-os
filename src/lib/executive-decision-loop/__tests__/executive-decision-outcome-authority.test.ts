import { beforeEach, describe, expect, it, vi } from "vitest";

const repositoryMocks = vi.hoisted(() => ({
  closeExecutiveDecisionRecord: vi.fn(),
  createExecutiveDecisionOutcomeIfMissing: vi.fn(),
  findRecentOpenExecutiveDecisionRecords: vi.fn(),
  markExecutiveDecisionRecordCommitted: vi.fn(),
  upsertExecutiveDecisionRecord: vi.fn(),
}));

vi.mock("../executive-decision-record.repository", () => repositoryMocks);

import { registerExecutiveDecisionOutcome } from "../executive-decision-outcome.service";
import {
  findBestOpenDecisionRecord,
  registerExecutiveDecisionCommitment,
} from "../executive-decision-record.service";

const firstDecision = {
  id: "decision-1",
  title: "Tahsilat planını netleştir",
  status: "COMMITTED" as const,
};

const secondDecision = {
  id: "decision-2",
  title: "Yeni fiyat politikasını onayla",
  status: "COMMITTED" as const,
};

const outcomeInput = {
  organizationId: "org-1",
  conversationId: "conversation-1",
  sourceMessageId: "message-1",
  committedTitle: "Eşleşmeyen karar başlığı",
  outcome: "SUCCESS" as const,
  summary: "Karar başarıyla tamamlandı.",
  evidenceJson: null,
};

describe("executive decision outcome authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the exact matching open decision", async () => {
    repositoryMocks.findRecentOpenExecutiveDecisionRecords.mockResolvedValue([
      firstDecision,
      secondDecision,
    ]);

    await expect(
      findBestOpenDecisionRecord("org-1", "  yeni FİYAT politikasını onayla "),
    ).resolves.toBe(secondDecision);
  });

  it("returns the existing contained title match", async () => {
    repositoryMocks.findRecentOpenExecutiveDecisionRecords.mockResolvedValue([
      firstDecision,
      secondDecision,
    ]);

    await expect(
      findBestOpenDecisionRecord("org-1", "Bu hafta tahsilat planını netleştir"),
    ).resolves.toBe(firstDecision);
  });

  it("returns null when no open decision title matches", async () => {
    repositoryMocks.findRecentOpenExecutiveDecisionRecords.mockResolvedValue([
      firstDecision,
    ]);

    await expect(
      findBestOpenDecisionRecord("org-1", "Stok sayımını tamamla"),
    ).resolves.toBeNull();
  });

  it("does not fall back to the first record when multiple decisions are unmatched", async () => {
    repositoryMocks.findRecentOpenExecutiveDecisionRecords.mockResolvedValue([
      firstDecision,
      secondDecision,
    ]);

    await expect(
      findBestOpenDecisionRecord("org-1", "Stok sayımını tamamla"),
    ).resolves.toBeNull();
  });

  it("creates the outcome and closes the exact matching decision", async () => {
    repositoryMocks.findRecentOpenExecutiveDecisionRecords.mockResolvedValue([
      firstDecision,
      secondDecision,
    ]);

    await registerExecutiveDecisionOutcome({
      ...outcomeInput,
      committedTitle: secondDecision.title,
    });

    expect(repositoryMocks.createExecutiveDecisionOutcomeIfMissing).toHaveBeenCalledWith(
      expect.objectContaining({ decisionRecordId: secondDecision.id }),
      expect.objectContaining({ canonicalOwner: "DECISION_RECORD" }),
    );
    expect(repositoryMocks.closeExecutiveDecisionRecord).toHaveBeenCalledWith(
      expect.objectContaining({ id: secondDecision.id }),
      expect.objectContaining({ transition: "CLOSE", fromStatus: "COMMITTED" }),
    );
  });

  it("does not create an outcome or close a decision when no title matches", async () => {
    repositoryMocks.findRecentOpenExecutiveDecisionRecords.mockResolvedValue([
      firstDecision,
      secondDecision,
    ]);

    await registerExecutiveDecisionOutcome(outcomeInput);

    expect(repositoryMocks.createExecutiveDecisionOutcomeIfMissing).not.toHaveBeenCalled();
    expect(repositoryMocks.closeExecutiveDecisionRecord).not.toHaveBeenCalled();
  });

  it("preserves the safe no-op when there are no open decisions", async () => {
    repositoryMocks.findRecentOpenExecutiveDecisionRecords.mockResolvedValue([]);

    await expect(registerExecutiveDecisionOutcome(outcomeInput)).resolves.toBeUndefined();
    expect(repositoryMocks.createExecutiveDecisionOutcomeIfMissing).not.toHaveBeenCalled();
    expect(repositoryMocks.closeExecutiveDecisionRecord).not.toHaveBeenCalled();
  });

  it("commits PROPOSED through a bound transition capability", async () => {
    repositoryMocks.findRecentOpenExecutiveDecisionRecords.mockResolvedValue([{
      ...firstDecision,
      status: "PROPOSED",
    }]);

    await registerExecutiveDecisionCommitment({
      organizationId: "org-1",
      conversationId: "conversation-1",
      sourceMessageId: "message-1",
      committedTitle: firstDecision.title,
    });

    expect(repositoryMocks.markExecutiveDecisionRecordCommitted).toHaveBeenCalledWith(
      expect.objectContaining({ id: firstDecision.id }),
      expect.objectContaining({
        transition: "COMMIT",
        fromStatus: "PROPOSED",
        toStatus: "COMMITTED",
      }),
    );
  });

  it("rejects invalid COMMITTED → COMMITTED transition", async () => {
    repositoryMocks.findRecentOpenExecutiveDecisionRecords.mockResolvedValue([firstDecision]);
    await expect(registerExecutiveDecisionCommitment({
      organizationId: "org-1",
      conversationId: "conversation-1",
      sourceMessageId: "message-1",
      committedTitle: firstDecision.title,
    })).rejects.toThrow("cannot be committed from COMMITTED");
  });
});
