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
  classifyDocumentAttachment: vi.fn(),
  extractDocumentAttachment: vi.fn(),
  listCustomersForOrg: vi.fn(),
  ensurePublicStatementToken: vi.fn(),
  getCustomerStatement: vi.fn(),
  listQuotesByOrganization: vi.fn(),
  computeCarrierPerformance: vi.fn(),
  computeDeliveryPerformance: vi.fn(),
  computeShipmentIntegrity: vi.fn(),
  resolveEntityReference: vi.fn(),
}));

vi.mock("@/lib/field-visits/field-visit-report-orchestrator.service", () => ({ processFieldVisitReport: mocks.processFieldVisitReport }));
vi.mock("@/lib/field-visits/field-visit-weekly-summary-request.service", () => ({ resolveFieldVisitWeeklySummaryRequest: mocks.resolveFieldVisitWeeklySummaryRequest }));
vi.mock("@/lib/rep-goals/rep-goal-create-orchestrator.service", () => ({ processRepGoalReport: mocks.processRepGoalReport }));
vi.mock("@/lib/rep-requests/rep-request-propose-orchestrator.service", () => ({ proposeRepRequest: mocks.proposeRepRequest }));
vi.mock("@/lib/executive-communication/payment-reminder-trigger-resolver", () => ({ resolveAndSendPaymentReminder: mocks.resolveAndSendPaymentReminder }));
vi.mock("@/lib/executive-communication/payment-reminder-ai-adapter", () => ({ generatePaymentReminderText: vi.fn() }));
vi.mock("@/lib/executive-communication/executive-communication.service", () => ({ sendSupplierMessage: mocks.sendSupplierMessage }));
vi.mock("@/lib/core/suppliers/supplier.service", () => ({ listSuppliers: mocks.listSuppliers }));
vi.mock("@/lib/documents/document-intelligence-orchestrator.service", () => ({ classifyDocumentAttachment: mocks.classifyDocumentAttachment, extractDocumentAttachment: mocks.extractDocumentAttachment }));
vi.mock("@/lib/core/customers/customer.service", () => ({ listCustomers: mocks.listCustomersForOrg }));
vi.mock("@/lib/accounting/customer-statement-public-link.service", () => ({ ensurePublicStatementToken: mocks.ensurePublicStatementToken }));
vi.mock("@/lib/accounting/customer-statement.service", () => ({ getCustomerStatement: mocks.getCustomerStatement }));
vi.mock("@/lib/core/quotes/quote.service", () => ({ listQuotesByOrganization: mocks.listQuotesByOrganization }));
vi.mock("@/lib/core/deliveries/delivery-intelligence.service", () => ({
  computeCarrierPerformance: mocks.computeCarrierPerformance,
  computeDeliveryPerformance: mocks.computeDeliveryPerformance,
  computeShipmentIntegrity: mocks.computeShipmentIntegrity,
}));
vi.mock("@/lib/executive-orchestration/entity-resolvers", () => ({ resolveEntityReference: mocks.resolveEntityReference }));

const {
  buildLogFieldVisitReportTool, buildFieldVisitWeeklySummaryTool, buildSubmitRepGoalReportTool,
  buildProposeRepRequestTool, buildSendPaymentReminderTool, buildSendSupplierMessageTool,
  buildAnalyzeActiveDocumentAttachmentTool, buildComposePaymentReminderWhatsAppTool,
  buildFindCustomerOpenQuoteTool, buildResolveRelativeDueDateTool,
  buildCarrierPerformanceTool, buildDeliveryPerformanceTool, buildShipmentIntegrityTool,
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
  activeDocumentAttachment: null,
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

  it("analyze_active_document_attachment returns NO_ACTIVE_ATTACHMENT and never classifies/extracts when runContext carries none — never guesses from prose", async () => {
    const result = await invoke(buildAnalyzeActiveDocumentAttachmentTool(runContext), { requestedDomain: "EXPENSE_RECEIPT" });
    expect(mocks.classifyDocumentAttachment).not.toHaveBeenCalled();
    expect(mocks.extractDocumentAttachment).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ status: "NO_ACTIVE_ATTACHMENT" });
  });

  it("stops with CLASSIFICATION_MISMATCH instead of extracting when the document's own classification disagrees with the requested domain", async () => {
    const withAttachment = { ...runContext, activeDocumentAttachment: { attachmentRef: "att-1", filename: "fatura.pdf", mimeType: "application/pdf" } };
    mocks.classifyDocumentAttachment.mockResolvedValue({ domain: "PURCHASE_INVOICE", confidence: 0.9, needsReview: false });
    const result = await invoke(buildAnalyzeActiveDocumentAttachmentTool(withAttachment), { requestedDomain: "EXPENSE_RECEIPT" });
    expect(mocks.extractDocumentAttachment).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ status: "CLASSIFICATION_MISMATCH", requestedDomain: "EXPENSE_RECEIPT", actualDomain: "PURCHASE_INVOICE" });
  });

  it("classifies then extracts when the requested domain agrees with the document's own classification, using the exact attachmentRef from trusted runContext", async () => {
    const withAttachment = { ...runContext, activeDocumentAttachment: { attachmentRef: "att-1", filename: "fatura.pdf", mimeType: "application/pdf" } };
    mocks.classifyDocumentAttachment.mockResolvedValue({ domain: "EXPENSE_RECEIPT", confidence: 0.95, needsReview: false });
    mocks.extractDocumentAttachment.mockResolvedValue({ status: "EXTRACTED", payload: { domain: "EXPENSE_RECEIPT" } });
    const result = await invoke(buildAnalyzeActiveDocumentAttachmentTool(withAttachment), { requestedDomain: "EXPENSE_RECEIPT" });
    expect(mocks.classifyDocumentAttachment).toHaveBeenCalledWith({ organizationId: "org-1", actorId: "user-1", attachmentRef: "att-1" });
    expect(mocks.extractDocumentAttachment).toHaveBeenCalledWith({ organizationId: "org-1", actorId: "user-1", attachmentRef: "att-1" });
    expect(result.data).toMatchObject({ status: "EXTRACTED" });
  });

  it("compose_payment_reminder_whatsapp resolves the customer server-side, mints the statement link, and hands the CLIENT a typed instruction instead of opening anything itself", async () => {
    mocks.listCustomersForOrg.mockResolvedValue([{ id: "c-1", displayName: "Atlas İnşaat", legalName: null, phone: "0532 111 22 33", email: null, cariKodu: null, taxNumber: null }]);
    mocks.ensurePublicStatementToken.mockResolvedValue("tok123");
    mocks.getCustomerStatement.mockResolvedValue({ balances: [{ currency: "TRY", balanceCents: "150000" }] });
    let capturedAction: unknown = null;
    const result = await invoke(buildComposePaymentReminderWhatsAppTool(runContext, (payload) => { capturedAction = payload; }), { customerReference: "Atlas İnşaat" });
    expect(mocks.listCustomersForOrg).toHaveBeenCalledWith({ organizationId: "org-1", limit: 5000 });
    expect(mocks.ensurePublicStatementToken).toHaveBeenCalledWith("c-1", "org-1");
    expect(capturedAction).toMatchObject({ type: "whatsapp_compose", phone: "905321112233" });
    expect((capturedAction as { message: string }).message).toContain("tok123");
    expect(result.data).toMatchObject({ status: "READY" });
  });

  it("compose_payment_reminder_whatsapp never fires the client action when the customer has no usable phone", async () => {
    mocks.listCustomersForOrg.mockResolvedValue([{ id: "c-1", displayName: "Atlas İnşaat", legalName: null, phone: null, email: null, cariKodu: null, taxNumber: null }]);
    let capturedAction: unknown = "UNSET";
    const result = await invoke(buildComposePaymentReminderWhatsAppTool(runContext, (payload) => { capturedAction = payload; }), { customerReference: "Atlas İnşaat" });
    expect(capturedAction).toBe("UNSET");
    expect(mocks.ensurePublicStatementToken).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ status: "PHONE_MISSING" });
  });

  it("find_customer_open_quote resolves the customer's own quote with a positive amount, the exact same rule invoice-management's resolveInvoiceSourceQuote used", async () => {
    mocks.listQuotesByOrganization.mockResolvedValue([
      { id: "q1", customerId: "c-1", amount: "5000", title: "Atlas Dönüşüm Teklifi", wonAt: null, lostAt: null },
      { id: "q2", customerId: "c-1", amount: "0", title: "Sıfır Teklif", wonAt: null, lostAt: null },
      { id: "q3", customerId: "c-2", amount: "1000", title: "Başka Müşteri", wonAt: null, lostAt: null },
    ]);
    const result = await invoke(buildFindCustomerOpenQuoteTool(runContext), { customerId: "c-1" });
    expect(result.data).toMatchObject({ status: "RESOLVED", quoteId: "q1", amount: 5000 });
  });

  it("find_customer_open_quote reports AMBIGUOUS rather than guessing when more than one quote qualifies", async () => {
    mocks.listQuotesByOrganization.mockResolvedValue([
      { id: "q1", customerId: "c-1", amount: "5000", title: "Teklif A", wonAt: null, lostAt: null },
      { id: "q2", customerId: "c-1", amount: "3000", title: "Teklif B", wonAt: null, lostAt: null },
    ]);
    const result = await invoke(buildFindCustomerOpenQuoteTool(runContext), { customerId: "c-1" });
    expect(result.data).toMatchObject({ status: "AMBIGUOUS", options: ["Teklif A", "Teklif B"] });
  });

  it("resolve_relative_due_date resolves PAST/5 to exactly 5 days before the real server clock — the same arithmetic payment-management's OVERDUE_CLAUSE_PATTERN used", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T12:00:00.000Z"));
    const result = await invoke(buildResolveRelativeDueDateTool(), { direction: "PAST", days: 5 });
    expect(result.data).toMatchObject({ dueDateIso: "2026-08-07T12:00:00.000Z" });
    vi.useRealTimers();
  });

  it("resolve_relative_due_date resolves FUTURE/30 to exactly 30 days after the real server clock", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T12:00:00.000Z"));
    const result = await invoke(buildResolveRelativeDueDateTool(), { direction: "FUTURE", days: 30 });
    expect(result.data).toMatchObject({ dueDateIso: "2026-09-11T12:00:00.000Z" });
    vi.useRealTimers();
  });

  it("delivery_carrier_performance calls computeCarrierPerformance with organizationId and the requested window, defaulting to 90 days", async () => {
    mocks.computeCarrierPerformance.mockResolvedValue({ status: "AVAILABLE" });
    await invoke(buildCarrierPerformanceTool(runContext), { windowDays: null });
    expect(mocks.computeCarrierPerformance).toHaveBeenCalledWith("org-1", 90);
  });

  it("delivery_performance calls computeDeliveryPerformance with organizationId and the requested window", async () => {
    mocks.computeDeliveryPerformance.mockResolvedValue({ status: "AVAILABLE" });
    await invoke(buildDeliveryPerformanceTool(runContext), { windowDays: 30 });
    expect(mocks.computeDeliveryPerformance).toHaveBeenCalledWith("org-1", 30);
  });

  it("shipment_integrity resolves the delivery reference via the shared entity-resolver before calling computeShipmentIntegrity — never guesses the id", async () => {
    mocks.resolveEntityReference.mockResolvedValue({ status: "RESOLVED", id: "delivery-42", label: "IRS-0042" });
    mocks.computeShipmentIntegrity.mockResolvedValue({ status: "PARTIAL" });
    const result = await invoke(buildShipmentIntegrityTool(runContext), { deliveryReference: "IRS-0042" });
    expect(mocks.resolveEntityReference).toHaveBeenCalledWith("delivery", "org-1", "IRS-0042");
    expect(mocks.computeShipmentIntegrity).toHaveBeenCalledWith("delivery-42", "org-1");
    expect(result.data).toMatchObject({ status: "PARTIAL" });
  });

  it("shipment_integrity reports the resolver's own status without calling computeShipmentIntegrity when the reference doesn't resolve", async () => {
    mocks.resolveEntityReference.mockResolvedValue({ status: "NOT_FOUND" });
    const result = await invoke(buildShipmentIntegrityTool(runContext), { deliveryReference: "Bilinmeyen" });
    expect(mocks.computeShipmentIntegrity).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ status: "NOT_FOUND" });
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
