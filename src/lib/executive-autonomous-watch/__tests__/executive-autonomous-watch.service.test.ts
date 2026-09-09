// Stage 2: this module no longer computes its own severity judgment — it
// only wires evidence collection -> the single Executive Agent -> lifecycle
// persistence -> delivery. These tests assert the orchestration/wiring,
// not judgment content (that lives behind runAwarenessJudgment, itself a
// thin, tested wrapper around the canonical Executive Agent call).
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildExecutiveOperatingContextMock,
  runAwarenessJudgmentMock,
  listOrganizationIdsMock,
  applyJudgmentMock,
  resolveUnseenInsightsMock,
  deliverJudgmentMock,
  organizationFindUniqueMock,
  computeExecutiveSignalsMock,
} = vi.hoisted(() => ({
  buildExecutiveOperatingContextMock: vi.fn(),
  runAwarenessJudgmentMock: vi.fn(),
  listOrganizationIdsMock: vi.fn(),
  applyJudgmentMock: vi.fn(),
  resolveUnseenInsightsMock: vi.fn(),
  deliverJudgmentMock: vi.fn(),
  organizationFindUniqueMock: vi.fn(),
  computeExecutiveSignalsMock: vi.fn(),
}));

vi.mock("@/lib/executive-operating-context", () => ({
  buildExecutiveOperatingContext: buildExecutiveOperatingContextMock,
}));
vi.mock("@/lib/executive-agent", () => ({
  runAwarenessJudgment: runAwarenessJudgmentMock,
}));
vi.mock("@/lib/core/organizations/organization.repository", () => ({
  listOrganizationIds: listOrganizationIdsMock,
}));
vi.mock("@/lib/core/stock/stock-intelligence.service", () => ({
  computeExecutiveSignals: computeExecutiveSignalsMock,
}));
vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: { organization: { findUnique: organizationFindUniqueMock } },
}));
vi.mock("../executive-autonomous-watch-insight.repository", () => ({
  applyJudgment: applyJudgmentMock,
  resolveUnseenInsights: resolveUnseenInsightsMock,
}));
vi.mock("../executive-autonomous-watch-delivery.service", () => ({
  deliverJudgment: deliverJudgmentMock,
}));

import { runExecutiveWatch, runExecutiveWatchForOrganization } from "../executive-autonomous-watch.service";

const emptyAlertBundle = { organizationId: "org-1", generatedAt: "2026-09-09T00:00:00Z", criticalAlerts: [], highAlerts: [], watchAlerts: [], totalCount: 0, hasActionableItems: false };
const oneAlertBundle = {
  organizationId: "org-1",
  generatedAt: "2026-09-09T00:00:00Z",
  criticalAlerts: [{ id: "COLLECTION_PRESSURE_x", severity: "CRITICAL" as const, category: "COLLECTION_PRESSURE" as const, source: "payment_intelligence" as const, headline: "Tahsilat baskısı.", actionableStep: "Müşteriyi ara.", isActionable: true }],
  highAlerts: [],
  watchAlerts: [],
  totalCount: 1,
  hasActionableItems: true,
};

const silentJudgment = { correlationTitle: "x", evidenceFingerprints: ["COLLECTION_PRESSURE_x"], disposition: "SILENT" as const, significance: "LOW" as const, confidence: 0.4, reason: "r", insight: "i", recommendedNextMove: null, urgency: "LOW" as const, category: "FINANS" as const, deliveryEligible: false };
const interveneJudgment = { ...silentJudgment, disposition: "INTERVENE" as const, significance: "CRITICAL" as const, deliveryEligible: true };

describe("runExecutiveWatchForOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    organizationFindUniqueMock.mockResolvedValue({ name: "Test Org" });
    resolveUnseenInsightsMock.mockResolvedValue(0);
    computeExecutiveSignalsMock.mockResolvedValue({ status: "INSUFFICIENT_CANONICAL_DATA", healthSummary: "", riskSignalCount: 0, opportunitySignalCount: 0, operationalSignalCount: 0 });
  });

  it("skips the Executive Agent entirely when there is no evidence, and resolves stale insights", async () => {
    buildExecutiveOperatingContextMock.mockResolvedValue({ executiveAlerts: emptyAlertBundle, executiveAwareness: null });
    resolveUnseenInsightsMock.mockResolvedValue(2);

    const result = await runExecutiveWatchForOrganization("org-1");

    expect(runAwarenessJudgmentMock).not.toHaveBeenCalled();
    expect(result).toEqual({ organizationId: "org-1", evidenceObserved: 0, judgmentsMade: 0, notificationsSent: 0, resolvedInsights: 2, skipped: false });
  });

  it("does not deliver a SILENT judgment", async () => {
    buildExecutiveOperatingContextMock.mockResolvedValue({ executiveAlerts: oneAlertBundle, executiveAwareness: null });
    runAwarenessJudgmentMock.mockResolvedValue([silentJudgment]);
    applyJudgmentMock.mockResolvedValue({ insightId: "insight-1", isNew: true, isEscalation: false, shouldDeliver: false });

    const result = await runExecutiveWatchForOrganization("org-1");

    expect(applyJudgmentMock).toHaveBeenCalledWith("org-1", silentJudgment);
    expect(deliverJudgmentMock).not.toHaveBeenCalled();
    expect(result.notificationsSent).toBe(0);
  });

  it("delivers an INTERVENE judgment the lifecycle marks deliverable", async () => {
    buildExecutiveOperatingContextMock.mockResolvedValue({ executiveAlerts: oneAlertBundle, executiveAwareness: { primaryNarrative: "narrative" } });
    runAwarenessJudgmentMock.mockResolvedValue([interveneJudgment]);
    applyJudgmentMock.mockResolvedValue({ insightId: "insight-1", isNew: true, isEscalation: false, shouldDeliver: true });
    deliverJudgmentMock.mockResolvedValue(1);

    const result = await runExecutiveWatchForOrganization("org-1");

    expect(runAwarenessJudgmentMock).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      organizationName: "Test Org",
      companyNarrative: "narrative",
    }));
    expect(deliverJudgmentMock).toHaveBeenCalledWith("org-1", "insight-1", interveneJudgment);
    expect(result.notificationsSent).toBe(1);
    expect(result.judgmentsMade).toBe(1);
  });

  it("does not deliver INTERVENE when the lifecycle says it's a duplicate (dedup)", async () => {
    buildExecutiveOperatingContextMock.mockResolvedValue({ executiveAlerts: oneAlertBundle, executiveAwareness: null });
    runAwarenessJudgmentMock.mockResolvedValue([interveneJudgment]);
    applyJudgmentMock.mockResolvedValue({ insightId: "insight-1", isNew: false, isEscalation: false, shouldDeliver: false });

    const result = await runExecutiveWatchForOrganization("org-1");

    expect(deliverJudgmentMock).not.toHaveBeenCalled();
    expect(result.notificationsSent).toBe(0);
  });
});

describe("cross-domain correlation (final consolidation §6): real evidence merging, one bounded call per org", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    organizationFindUniqueMock.mockResolvedValue({ name: "Test Org" });
    resolveUnseenInsightsMock.mockResolvedValue(0);
    applyJudgmentMock.mockResolvedValue({ insightId: "insight-1", isNew: true, isEscalation: false, shouldDeliver: true });
    deliverJudgmentMock.mockResolvedValue(1);
    runAwarenessJudgmentMock.mockResolvedValue([interveneJudgment]);
  });

  it("merges financial-pressure evidence from two independent domains (alerts + financial health) into one Agent call", async () => {
    computeExecutiveSignalsMock.mockResolvedValue({ status: "INSUFFICIENT_CANONICAL_DATA", healthSummary: "", riskSignalCount: 0, opportunitySignalCount: 0, operationalSignalCount: 0 });
    buildExecutiveOperatingContextMock.mockResolvedValue({
      generatedAt: "2026-09-10T00:00:00Z",
      executiveAlerts: oneAlertBundle,
      executiveAwareness: null,
      financialHealthIntelligence: { cashPressureLevel: "CRITICAL", riskWarnings: ["Üç büyük alacak aynı hafta gecikti."], executiveSummary: "Nakit baskısı kritik." },
    });

    await runExecutiveWatchForOrganization("org-1");

    expect(runAwarenessJudgmentMock).toHaveBeenCalledTimes(1);
    const evidence = runAwarenessJudgmentMock.mock.calls[0][0].evidence;
    expect(evidence.map((e: { source: string }) => e.source)).toEqual(expect.arrayContaining(["executive-alerts", "financial-health-intelligence"]));
  });

  it("merges operational-risk evidence from two independent domains (tasks + stock) into one Agent call", async () => {
    computeExecutiveSignalsMock.mockResolvedValue({ status: "AVAILABLE", healthSummary: "Kritik stok 3.", riskSignalCount: 3, opportunitySignalCount: 0, operationalSignalCount: 0 });
    buildExecutiveOperatingContextMock.mockResolvedValue({
      generatedAt: "2026-09-10T00:00:00Z",
      executiveAlerts: emptyAlertBundle,
      executiveAwareness: null,
      taskContext: { openCount: 10, overdueCount: 6, dueTodayCount: 2, completedCount: 1, priorityBreakdown: { LOW: 1, MEDIUM: 2, HIGH: 3 }, assigneeDistribution: [], openItems: [] },
    });

    await runExecutiveWatchForOrganization("org-1");

    const evidence = runAwarenessJudgmentMock.mock.calls[0][0].evidence;
    expect(evidence.map((e: { source: string }) => e.source)).toEqual(expect.arrayContaining(["task-context", "stock-intelligence"]));
  });

  it("delivers exactly once even though the judgment was grounded in multiple evidence domains (dedup identity is the evidence set, not the domain count)", async () => {
    computeExecutiveSignalsMock.mockResolvedValue({ status: "AVAILABLE", healthSummary: "Aşırı stok 2.", riskSignalCount: 0, opportunitySignalCount: 2, operationalSignalCount: 0 });
    buildExecutiveOperatingContextMock.mockResolvedValue({
      generatedAt: "2026-09-10T00:00:00Z",
      executiveAlerts: emptyAlertBundle,
      executiveAwareness: null,
      companyPerformanceSignal: { generatedAt: "2026-09-10T00:00:00Z", momentum: "ACCELERATING", primaryStrength: "Satış hızı üç aydır artıyor.", executiveSummary: "s", performanceLevel: "STRONG" },
    });

    const result = await runExecutiveWatchForOrganization("org-1");

    expect(deliverJudgmentMock).toHaveBeenCalledTimes(1);
    expect(result.notificationsSent).toBe(1);
  });
});

describe("runExecutiveWatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    organizationFindUniqueMock.mockResolvedValue({ name: "Test Org" });
    resolveUnseenInsightsMock.mockResolvedValue(0);
    computeExecutiveSignalsMock.mockResolvedValue({ status: "INSUFFICIENT_CANONICAL_DATA", healthSummary: "", riskSignalCount: 0, opportunitySignalCount: 0, operationalSignalCount: 0 });
  });

  it("processes every organization independently and isolates one org's evidence from another (multi-org isolation)", async () => {
    listOrganizationIdsMock.mockResolvedValue(["org-1", "org-2"]);
    buildExecutiveOperatingContextMock
      .mockResolvedValueOnce({ executiveAlerts: oneAlertBundle, executiveAwareness: null })
      .mockResolvedValueOnce({ executiveAlerts: emptyAlertBundle, executiveAwareness: null });
    runAwarenessJudgmentMock.mockResolvedValue([interveneJudgment]);
    applyJudgmentMock.mockResolvedValue({ insightId: "insight-1", isNew: true, isEscalation: false, shouldDeliver: true });
    deliverJudgmentMock.mockResolvedValue(1);

    const result = await runExecutiveWatch();

    expect(result.processed).toBe(2);
    expect(runAwarenessJudgmentMock).toHaveBeenCalledTimes(1);
    expect(runAwarenessJudgmentMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1" }));
    expect(result.totalNotificationsSent).toBe(1);
  });

  it("does not let one organization's failure stop the batch", async () => {
    listOrganizationIdsMock.mockResolvedValue(["org-1", "org-2"]);
    buildExecutiveOperatingContextMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ executiveAlerts: emptyAlertBundle, executiveAwareness: null });

    const result = await runExecutiveWatch();

    expect(result.processed).toBe(2);
    expect(result.results[0]).toEqual({ organizationId: "org-1", evidenceObserved: 0, judgmentsMade: 0, notificationsSent: 0, resolvedInsights: 0, skipped: true });
  });
});
