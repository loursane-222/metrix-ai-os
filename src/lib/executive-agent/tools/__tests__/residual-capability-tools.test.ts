import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Residual Capability Parity Migration: these 6 Agent tools give the
 * Executive Agent the exact same execution primitives 7 retired
 * conversation extensions used to own (field-visit report + weekly
 * summary, a rep's own goal report, the propose-not-execute rep-request
 * family, and the payment-reminder/supplier-message email sends). Each
 * test proves the tool is a THIN delegation — same underlying service
 * function, same arguments shape, no reimplemented extraction/validation
 * logic — not a fresh, independently-reasoning capability.
 */

const mocks = vi.hoisted(() => ({
  processFieldVisitReport: vi.fn(),
  resolveFieldVisitWeeklySummaryRequest: vi.fn(),
  processRepGoalReport: vi.fn(),
  proposeRepRequest: vi.fn(),
  resolveAndSendPaymentReminder: vi.fn(),
  sendSupplierMessage: vi.fn(),
  listSuppliers: vi.fn(),
}));

vi.mock("@/lib/field-visits/field-visit-report-orchestrator.service", () => ({ processFieldVisitReport: mocks.processFieldVisitReport }));
vi.mock("@/lib/field-visits/field-visit-weekly-summary-request.service", () => ({ resolveFieldVisitWeeklySummaryRequest: mocks.resolveFieldVisitWeeklySummaryRequest }));
vi.mock("@/lib/rep-goals/rep-goal-create-orchestrator.service", () => ({ processRepGoalReport: mocks.processRepGoalReport }));
vi.mock("@/lib/rep-requests/rep-request-propose-orchestrator.service", () => ({ proposeRepRequest: mocks.proposeRepRequest }));
vi.mock("@/lib/executive-communication/payment-reminder-trigger-resolver", () => ({ resolveAndSendPaymentReminder: mocks.resolveAndSendPaymentReminder }));
vi.mock("@/lib/executive-communication/payment-reminder-ai-adapter", () => ({ generatePaymentReminderText: vi.fn() }));
vi.mock("@/lib/executive-communication/executive-communication.service", () => ({ sendSupplierMessage: mocks.sendSupplierMessage }));
vi.mock("@/lib/core/suppliers/supplier.service", () => ({ listSuppliers: mocks.listSuppliers }));

const {
  buildLogFieldVisitReportTool, buildFieldVisitWeeklySummaryTool, buildSubmitRepGoalReportTool,
  buildProposeRepRequestTool, buildSendPaymentReminderTool, buildSendSupplierMessageTool,
} = await import("../residual-capability-tools");

const runContext = {
  organizationId: "org-1",
  actorId: "user-1",
  organizationName: "Test Co",
  role: "OWNER",
  timeZone: "Europe/Istanbul",
  channel: "written" as const,
  conversationId: "conv-1",
  requestId: "req-1",
  correlationId: "corr-1",
  authContext: { organization: { id: "org-1" }, user: { id: "user-1" }, membership: { role: "OWNER" } } as never,
};

async function invoke(tool: { invoke: (ctx: never, input: string) => Promise<unknown> }, input: Record<string, unknown>): Promise<{ data: unknown }> {
  const result = await tool.invoke({ context: runContext } as never, JSON.stringify(input));
  return result as { data: unknown };
}

describe("residual capability tools — thin delegation, no reimplementation", () => {
  afterEach(() => { vi.clearAllMocks(); });

  it("log_field_visit_report calls processFieldVisitReport with the authContext and verbatim message, unchanged", async () => {
    mocks.processFieldVisitReport.mockResolvedValue({ status: "LOGGED", fieldVisitId: "fv-1" });
    const result = await invoke(buildLogFieldVisitReportTool(runContext), { message: "Arde Yapı ile toplantı, 09:00-11:00" });
    expect(mocks.processFieldVisitReport).toHaveBeenCalledWith({ authContext: runContext.authContext, message: "Arde Yapı ile toplantı, 09:00-11:00", correlationId: "corr-1" });
    expect(result.data).toMatchObject({ status: "LOGGED" });
  });

  it("get_field_visit_weekly_summary calls resolveFieldVisitWeeklySummaryRequest with the authContext and the raw targetReference", async () => {
    mocks.resolveFieldVisitWeeklySummaryRequest.mockResolvedValue({ status: "ALLOWED" });
    await invoke(buildFieldVisitWeeklySummaryTool(runContext), { targetReference: "ekip" });
    expect(mocks.resolveFieldVisitWeeklySummaryRequest).toHaveBeenCalledWith({ authContext: runContext.authContext, targetReference: "ekip" });
  });

  it("submit_rep_goal_report calls processRepGoalReport with the authContext and verbatim message — manager-role gating stays inside the unchanged service", async () => {
    mocks.processRepGoalReport.mockResolvedValue({ status: "DENIED" });
    const result = await invoke(buildSubmitRepGoalReportTool(runContext), { message: "Ahmet'in bu ay ziyaret hedefini 20 yap" });
    expect(mocks.processRepGoalReport).toHaveBeenCalledWith({ authContext: runContext.authContext, message: "Ahmet'in bu ay ziyaret hedefini 20 yap" });
    expect(result.data).toMatchObject({ status: "DENIED" });
  });

  it.each(["ORDER", "QUOTE", "PAYMENT"] as const)("propose_rep_request(%s) calls the SAME proposeRepRequest orchestrator for every domain — one shared tool, not three copies", async (domain) => {
    mocks.proposeRepRequest.mockResolvedValue({ status: "PROPOSED", domain, customerNameRaw: "Atlas" });
    await invoke(buildProposeRepRequestTool(runContext), { domain, message: `${domain} onay iste` });
    expect(mocks.proposeRepRequest).toHaveBeenCalledWith({ authContext: runContext.authContext, domain, message: `${domain} onay iste` });
  });

  it("send_payment_reminder calls resolveAndSendPaymentReminder with organizationId/actorId from runContext, never inventing them", async () => {
    mocks.resolveAndSendPaymentReminder.mockResolvedValue({ status: "SENT", customerName: "Atlas" });
    await invoke(buildSendPaymentReminderTool(runContext), { customerReference: "Atlas" });
    expect(mocks.resolveAndSendPaymentReminder).toHaveBeenCalledWith(expect.objectContaining({ utterance: "Atlas", organizationId: "org-1", actorUserId: "user-1" }));
  });

  it("send_supplier_message resolves the supplier server-side (not the browser suppliers-client) then calls sendSupplierMessage with the resolved id and the user's verbatim message", async () => {
    mocks.listSuppliers.mockResolvedValue([{ id: "sup-1", displayName: "Vega Metal", legalName: null, phone: null, email: "vega@example.com", website: null, taxNumber: null, taxOffice: null, metrixNote: null, riskNotes: null, status: "ACTIVE", score: null, executiveSummary: null, deliveryPerformance: null, qualityPerformance: null, pricingPerformance: null, riskProfile: null, updatedAt: new Date("2026-01-01T00:00:00.000Z") }]);
    mocks.sendSupplierMessage.mockResolvedValue({ outcome: "SENT" });
    await invoke(buildSendSupplierMessageTool(runContext), { supplierReference: "Vega Metal", messageBody: "Siparişin teslim tarihini onaylar mısınız?" });
    expect(mocks.listSuppliers).toHaveBeenCalledWith({ organizationId: "org-1", status: "ACTIVE" });
    expect(mocks.sendSupplierMessage).toHaveBeenCalledWith({ organizationId: "org-1", supplierId: "sup-1", messageBody: "Siparişin teslim tarihini onaylar mısınız?", actorUserId: "user-1" });
  });

  it("resolves NOT_FOUND cleanly when no supplier matches, without calling sendSupplierMessage", async () => {
    mocks.listSuppliers.mockResolvedValue([]);
    const result = await invoke(buildSendSupplierMessageTool(runContext), { supplierReference: "Bilinmeyen Firma", messageBody: "Merhaba" });
    expect(mocks.sendSupplierMessage).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ outcome: "SUPPLIER_NOT_FOUND" });
  });
});

describe("architectural guard — no raw fetch/HTTP, no duplicated regex/phrase logic", () => {
  const source = readFileSync(new URL("../residual-capability-tools.ts", import.meta.url), "utf8");
  it("never calls fetch directly — every tool delegates to an existing server-side service function", () => {
    expect(source).not.toMatch(/\bfetch\(/);
  });
  it("never declares its own trigger regex — semantic recognition is the Agent's job, not this file's", () => {
    expect(source).not.toMatch(/new RegExp\(|\/[^/\n]+\/[a-z]*\.test\(/u);
  });
});
