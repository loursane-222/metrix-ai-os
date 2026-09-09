// Anti-noise lifecycle (Grand Consolidation §5.5-5.6, acceptance D/E/F/L):
// dedup, escalation, resolution, restart-safety. This is where Stage 2's
// "don't repeat yourself" behavior actually lives, so it is tested directly
// against the persistence layer rather than through the full orchestrator.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  executiveAwarenessInsight: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
  },
}));
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: db }));

import { applyJudgment, deriveInsightFingerprint, resolveUnseenInsights } from "../executive-autonomous-watch-insight.repository";

const judgment = {
  correlationTitle: "Nakit baskısı",
  evidenceFingerprints: ["b", "a"],
  disposition: "INTERVENE" as const,
  significance: "HIGH" as const,
  confidence: 0.8,
  reason: "r",
  insight: "i",
  recommendedNextMove: null,
  urgency: "HIGH" as const,
  category: "FINANS" as const,
  deliveryEligible: true,
};

describe("deriveInsightFingerprint", () => {
  it("is order-independent so the same evidence set always maps to the same row (restart safety)", () => {
    expect(deriveInsightFingerprint(["b", "a"])).toBe(deriveInsightFingerprint(["a", "b"]));
  });
});

describe("applyJudgment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a new OPEN row and delivers on first sight of an INTERVENE-eligible issue", async () => {
    db.executiveAwarenessInsight.findUnique.mockResolvedValue(null);
    db.executiveAwarenessInsight.create.mockResolvedValue({ id: "insight-1" });

    const outcome = await applyJudgment("org-1", judgment);

    expect(outcome).toEqual({ insightId: "insight-1", isNew: true, isEscalation: false, shouldDeliver: true });
    expect(db.executiveAwarenessInsight.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: "org-1", status: "OPEN", lastDeliveredSignificance: "HIGH" }),
    }));
  });

  it("does not redeliver the same still-open, already-delivered issue (dedup)", async () => {
    db.executiveAwarenessInsight.findUnique.mockResolvedValue({
      id: "insight-1", status: "OPEN", lastDeliveredAt: new Date(), lastDeliveredSignificance: "HIGH",
    });
    db.executiveAwarenessInsight.update.mockResolvedValue({ id: "insight-1" });

    const outcome = await applyJudgment("org-1", judgment);

    expect(outcome.shouldDeliver).toBe(false);
    expect(outcome.isNew).toBe(false);
  });

  it("redelivers when significance escalates past what was last delivered", async () => {
    db.executiveAwarenessInsight.findUnique.mockResolvedValue({
      id: "insight-1", status: "OPEN", lastDeliveredAt: new Date(), lastDeliveredSignificance: "MEDIUM",
    });
    db.executiveAwarenessInsight.update.mockResolvedValue({ id: "insight-1" });

    const outcome = await applyJudgment("org-1", { ...judgment, significance: "CRITICAL" });

    expect(outcome.isEscalation).toBe(true);
    expect(outcome.shouldDeliver).toBe(true);
  });

  it("reopens and redelivers a previously RESOLVED issue that has recurred", async () => {
    db.executiveAwarenessInsight.findUnique.mockResolvedValue({
      id: "insight-1", status: "RESOLVED", lastDeliveredAt: new Date(), lastDeliveredSignificance: "HIGH",
    });
    db.executiveAwarenessInsight.update.mockResolvedValue({ id: "insight-1" });

    const outcome = await applyJudgment("org-1", judgment);

    expect(outcome.shouldDeliver).toBe(true);
    expect(db.executiveAwarenessInsight.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "OPEN", resolvedAt: null }),
    }));
  });

  it("never delivers a SILENT judgment even for a brand-new issue", async () => {
    db.executiveAwarenessInsight.findUnique.mockResolvedValue(null);
    db.executiveAwarenessInsight.create.mockResolvedValue({ id: "insight-1" });

    const outcome = await applyJudgment("org-1", { ...judgment, disposition: "SILENT", deliveryEligible: false });

    expect(outcome.shouldDeliver).toBe(false);
  });
});

describe("resolveUnseenInsights", () => {
  it("closes OPEN insights not re-observed this run, org-scoped", async () => {
    db.executiveAwarenessInsight.updateMany.mockResolvedValue({ count: 3 });

    const count = await resolveUnseenInsights("org-1", ["insight-1"]);

    expect(count).toBe(3);
    expect(db.executiveAwarenessInsight.updateMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", status: "OPEN", id: { notIn: ["insight-1"] } },
      data: expect.objectContaining({ status: "RESOLVED" }),
    });
  });
});
