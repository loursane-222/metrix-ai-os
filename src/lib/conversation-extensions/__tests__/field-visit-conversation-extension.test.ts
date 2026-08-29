import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateConversationExtensionHandoff } from "../conversation-extension-handoff";

const mocks = vi.hoisted(() => ({ submitFieldVisitReport: vi.fn(), fetchFieldVisitWeeklySummary: vi.fn() }));
vi.mock("@/lib/field-visits/field-visits-client", () => ({ submitFieldVisitReport: mocks.submitFieldVisitReport, fetchFieldVisitWeeklySummary: mocks.fetchFieldVisitWeeklySummary }));

const { fieldVisitConversationExtension } = await import("../field-visit-conversation-extension");

// The server (route.ts) re-validates every handoff through this exact
// function before trusting it (conversation-extension-handoff.ts) — a
// handoff that looks fine in isolation can still fail there (e.g. a
// disallowed character like parentheses in a candidateName). Asserting
// against the real validator, not just ad-hoc checks, is what actually
// catches that class of bug.
function expectValidHandoff(handoff: unknown) {
  expect(validateConversationExtensionHandoff(handoff)).not.toBeNull();
}

beforeEach(() => { vi.clearAllMocks(); });

describe("field-visit-conversation-extension", () => {
  it("does not handle an utterance with no visit-report keyword", async () => {
    const result = await fieldVisitConversationExtension.execute("Bugün hava çok güzel");
    expect(result.status).toBe("NOT_HANDLED");
    expect(mocks.submitFieldVisitReport).not.toHaveBeenCalled();
  });

  it("logs a visit and reports EXECUTED with the resolved customer name", async () => {
    mocks.submitFieldVisitReport.mockResolvedValue({
      ok: true,
      data: { report: { status: "LOGGED", fieldVisitId: "visit-1", customerNameRaw: "Arde Yapı", customerResolved: true, requestTypes: [], orderCreated: false, paymentCreated: false } },
    });

    const result = await fieldVisitConversationExtension.execute("Arde Yapı ile toplantı yaptım, 09:00-11:00.");

    expect(mocks.submitFieldVisitReport).toHaveBeenCalledWith("Arde Yapı ile toplantı yaptım, 09:00-11:00.");
    expect(result.status).toBe("HANDOFF");
    expect(result.handoff).toMatchObject({ outcomeCode: "FIELD_VISIT_LOGGED", resultStatus: "EXECUTED", mutationPerformed: true, entityResolution: "RESOLVED", candidateNames: ["Arde Yapı"] });
    expectValidHandoff(result.handoff);
  });

  it("marks entityResolution NOT_FOUND when the customer couldn't be matched, without failing the turn", async () => {
    mocks.submitFieldVisitReport.mockResolvedValue({
      ok: true,
      data: { report: { status: "LOGGED", fieldVisitId: "visit-2", customerNameRaw: "Bilinmeyen Firma", customerResolved: false, requestTypes: [], orderCreated: false, paymentCreated: false } },
    });

    const result = await fieldVisitConversationExtension.execute("Bilinmeyen Firma ile ziyaret yaptım.");
    expect(result.handoff).toMatchObject({ resultStatus: "EXECUTED", entityResolution: "NOT_FOUND" });
  });

  it("falls through as NOT_HANDLED when the parser found nothing to log", async () => {
    mocks.submitFieldVisitReport.mockResolvedValue({ ok: true, data: { report: { status: "PARSE_FAILED" } } });
    const result = await fieldVisitConversationExtension.execute("Geçen hafta yaptığımız ziyaretler hakkında ne düşünüyorsun?");
    expect(result).toEqual({ status: "NOT_HANDLED", handoff: null });
  });

  it("reports FAILED when the request itself fails", async () => {
    mocks.submitFieldVisitReport.mockResolvedValue({ ok: false, error: "Baglanti kurulamadi." });
    const result = await fieldVisitConversationExtension.execute("Arde Yapı ile toplantı yaptım.");
    expect(result.handoff).toMatchObject({ outcomeCode: "FIELD_VISIT_REPORT_FAILED", resultStatus: "FAILED" });
  });

  describe("weekly summary query branch", () => {
    it("routes 'bu hafta ziyaret' phrasing to the summary lookup instead of logging a new visit", async () => {
      mocks.fetchFieldVisitWeeklySummary.mockResolvedValue({
        ok: true,
        data: { lookup: { status: "ALLOWED", scope: "SELF", repFullName: null, companyGoalStatus: null, personalGoalStatus: null, summary: { weekStart: "2026-08-24", weekEnd: "2026-08-30", visitCount: 5, distinctCustomerCount: 3, linkedOrderCount: 1, linkedPaymentCount: 1, linkedPaymentTotal: 10000 } } },
      });

      const result = await fieldVisitConversationExtension.execute("bu hafta ziyaret ettiklerimi özetle");

      expect(mocks.submitFieldVisitReport).not.toHaveBeenCalled();
      expect(mocks.fetchFieldVisitWeeklySummary).toHaveBeenCalledWith(null);
      expect(result.handoff).toMatchObject({ outcomeCode: "FIELD_VISIT_WEEKLY_SUMMARY_FOUND", resultStatus: "OBSERVED" });
      expect(result.handoff?.candidateNames).toHaveLength(1);
      expect(result.handoff?.candidateNames[0]).toContain("5 ziyaret");
      expectValidHandoff(result.handoff);
    });

    it("appends a second, separate line for company goal status, each line staying under the 120-char candidate-name cap", async () => {
      mocks.fetchFieldVisitWeeklySummary.mockResolvedValue({
        ok: true,
        data: {
          lookup: {
            status: "ALLOWED", scope: "SELF", repFullName: null, personalGoalStatus: null,
            companyGoalStatus: { monthlyTarget: 5_000_000, monthToDateRevenue: 1_200_000, forecastedMonthEndRevenue: 3_000_000, goalAchievementRate: 0.6, monthToDateCashCollection: 900_000 },
            summary: { weekStart: "2026-08-24", weekEnd: "2026-08-30", visitCount: 5, distinctCustomerCount: 3, linkedOrderCount: 1, linkedPaymentCount: 1, linkedPaymentTotal: 10000 },
          },
        },
      });

      const result = await fieldVisitConversationExtension.execute("bu haftaki özetim");

      const candidateNames = result.handoff?.candidateNames ?? [];
      expect(candidateNames).toHaveLength(2);
      for (const line of candidateNames) expect(line.length).toBeLessThanOrEqual(120);
      expect(candidateNames[1]).toContain("yüzde 60");
      expectValidHandoff(result.handoff);
    });

    it("appends a third line for personal goal status, only including the targets actually set", async () => {
      mocks.fetchFieldVisitWeeklySummary.mockResolvedValue({
        ok: true,
        data: {
          lookup: {
            status: "ALLOWED", scope: "SELF", repFullName: null, companyGoalStatus: null,
            personalGoalStatus: { visitTarget: 20, visitActual: 5, salesTarget: null, salesActual: 0, collectionTarget: 300000, collectionActual: 100000 },
            summary: { weekStart: "2026-08-24", weekEnd: "2026-08-30", visitCount: 5, distinctCustomerCount: 3, linkedOrderCount: 1, linkedPaymentCount: 1, linkedPaymentTotal: 10000 },
          },
        },
      });

      const result = await fieldVisitConversationExtension.execute("bu haftaki özetim");

      const candidateNames = result.handoff?.candidateNames ?? [];
      expect(candidateNames).toHaveLength(2);
      for (const line of candidateNames) expect(line.length).toBeLessThanOrEqual(120);
      expect(candidateNames[1]).toContain("5/20 ziyaret");
      expect(candidateNames[1]).toContain("tahsilat");
      expect(candidateNames[1]).not.toContain("satış");
      expectValidHandoff(result.handoff);
    });

    it("omits the personal goal line entirely when no target is set at all", async () => {
      mocks.fetchFieldVisitWeeklySummary.mockResolvedValue({
        ok: true,
        data: {
          lookup: {
            status: "ALLOWED", scope: "SELF", repFullName: null, companyGoalStatus: null,
            personalGoalStatus: { visitTarget: null, visitActual: 0, salesTarget: null, salesActual: 0, collectionTarget: null, collectionActual: 0 },
            summary: { weekStart: "2026-08-24", weekEnd: "2026-08-30", visitCount: 5, distinctCustomerCount: 3, linkedOrderCount: 1, linkedPaymentCount: 1, linkedPaymentTotal: 10000 },
          },
        },
      });

      const result = await fieldVisitConversationExtension.execute("bu haftaki özetim");
      expect(result.handoff?.candidateNames).toHaveLength(1);
    });

    it("labels the personal goal line with the rep count for a TEAM-scope aggregate", async () => {
      mocks.fetchFieldVisitWeeklySummary.mockResolvedValue({
        ok: true,
        data: {
          lookup: {
            status: "ALLOWED", scope: "TEAM", repFullName: null, companyGoalStatus: null,
            personalGoalStatus: { repCount: 3, visitTarget: 60, visitActual: 12, salesTarget: null, salesActual: 0, collectionTarget: null, collectionActual: 0 },
            summary: { weekStart: "2026-08-24", weekEnd: "2026-08-30", visitCount: 12, distinctCustomerCount: 8, linkedOrderCount: 2, linkedPaymentCount: 0, linkedPaymentTotal: 0 },
          },
        },
      });

      const result = await fieldVisitConversationExtension.execute("ekibin haftalık raporunu göster");

      const candidateNames = result.handoff?.candidateNames ?? [];
      expect(candidateNames[1]).toContain("Ekip hedef durumu, 3 temsilci");
      expect(candidateNames[1]).toContain("12/60 ziyaret");
      expectValidHandoff(result.handoff);
    });

    it("extracts a named colleague from a possessive phrase", async () => {
      mocks.fetchFieldVisitWeeklySummary.mockResolvedValue({ ok: true, data: { lookup: { status: "NOT_FOUND" } } });
      await fieldVisitConversationExtension.execute("Ahmet'in bu haftaki özetini göster");
      expect(mocks.fetchFieldVisitWeeklySummary).toHaveBeenCalledWith("Ahmet");
    });

    it("detects a team-wide request", async () => {
      mocks.fetchFieldVisitWeeklySummary.mockResolvedValue({ ok: true, data: { lookup: { status: "DENIED" } } });
      await fieldVisitConversationExtension.execute("ekibin haftalık raporunu göster");
      expect(mocks.fetchFieldVisitWeeklySummary).toHaveBeenCalledWith("ekip");
    });

    it("reports FAILED-shaped handoff when access is DENIED", async () => {
      mocks.fetchFieldVisitWeeklySummary.mockResolvedValue({ ok: true, data: { lookup: { status: "DENIED" } } });
      const result = await fieldVisitConversationExtension.execute("saha raporu göster");
      expect(result.handoff).toMatchObject({ outcomeCode: "FIELD_VISIT_WEEKLY_SUMMARY_DENIED", resultStatus: "FAILED" });
    });

    it("asks for clarification when multiple colleagues match", async () => {
      mocks.fetchFieldVisitWeeklySummary.mockResolvedValue({ ok: true, data: { lookup: { status: "AMBIGUOUS", options: ["Ahmet Yılmaz", "Ahmet Kara"] } } });
      const result = await fieldVisitConversationExtension.execute("haftalık özet göster");
      expect(result.handoff).toMatchObject({ outcomeCode: "FIELD_VISIT_WEEKLY_SUMMARY_REP_AMBIGUOUS", resultStatus: "CLARIFICATION_REQUIRED", candidateNames: ["Ahmet Yılmaz", "Ahmet Kara"] });
    });
  });
});
