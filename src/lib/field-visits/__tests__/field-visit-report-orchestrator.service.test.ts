import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  parseFieldVisitReportMock,
  listCustomersMock,
  executeActionMock,
  linkFieldVisitOutcomeByIdMock,
} = vi.hoisted(() => ({
  parseFieldVisitReportMock: vi.fn(),
  listCustomersMock: vi.fn(),
  executeActionMock: vi.fn(),
  linkFieldVisitOutcomeByIdMock: vi.fn(),
}));

vi.mock("../field-visit-report-parser.service", () => ({ parseFieldVisitReport: parseFieldVisitReportMock }));
vi.mock("@/lib/core/customers/customer.service", () => ({ listCustomers: listCustomersMock }));
vi.mock("@/lib/action-runtime/composition/production-execution-runtime", () => ({
  productionExecutionRuntime: { executeAction: executeActionMock },
}));
vi.mock("@/lib/core/field-visits/field-visit.service", () => ({ linkFieldVisitOutcomeById: linkFieldVisitOutcomeByIdMock }));

import { processFieldVisitReport } from "../field-visit-report-orchestrator.service";

const authContext = {
  user: { id: "user-1" },
  organization: { id: "org-1" },
  membership: { role: "EMPLOYEE" },
  session: { id: "sess-1", createdAt: new Date("2026-08-29T06:00:00.000Z"), expiresAt: new Date("2026-08-29T18:00:00.000Z") },
} as never;

const customer = { id: "cust-1", displayName: "Arde Yapı", legalName: null, phone: null, email: null, cariKodu: null, taxNumber: null };

function extraction(overrides: Record<string, unknown> = {}) {
  return {
    customerNameRaw: "Arde Yapı",
    contactNameRaw: "Mehmet Bey",
    startTime: "09:00",
    endTime: "11:00",
    notes: "Toplantı yapıldı.",
    requestTypes: [],
    orderIntent: null,
    paymentIntent: null,
    ...overrides,
  };
}

function successResult(entityType: string, entityId: string) {
  return { status: "SUCCESS", outcome: "SUCCEEDED", entityRef: { entityType, entityId } };
}

describe("processFieldVisitReport", () => {
  beforeEach(() => {
    parseFieldVisitReportMock.mockReset();
    listCustomersMock.mockReset().mockResolvedValue([customer]);
    executeActionMock.mockReset();
    linkFieldVisitOutcomeByIdMock.mockReset().mockResolvedValue(undefined);
  });

  it("returns PARSE_FAILED when the parser can't extract anything", async () => {
    parseFieldVisitReportMock.mockResolvedValue(null);
    const result = await processFieldVisitReport({ authContext, message: "belirsiz mesaj" });
    expect(result).toEqual({ status: "PARSE_FAILED" });
    expect(executeActionMock).not.toHaveBeenCalled();
  });

  it("logs a plain visit and does not create an order/payment when no intent is stated", async () => {
    parseFieldVisitReportMock.mockResolvedValue(extraction());
    executeActionMock.mockResolvedValueOnce(successResult("field_visit", "visit-1"));

    const result = await processFieldVisitReport({ authContext, message: "Arde Yapı ile toplantı yapıldı." });

    expect(executeActionMock).toHaveBeenCalledTimes(1);
    expect(executeActionMock.mock.calls[0]![0]).toMatchObject({ actionName: "field_visit.create", input: expect.objectContaining({ customerId: "cust-1", customerNameRaw: "Arde Yapı" }) });
    expect(linkFieldVisitOutcomeByIdMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "LOGGED", fieldVisitId: "visit-1", customerResolved: true, orderCreated: false, paymentCreated: false });
  });

  it("creates a draft order and links it back when an order intent is resolvable and the customer matches", async () => {
    parseFieldVisitReportMock.mockResolvedValue(extraction({ orderIntent: { productRef: null, quantity: 2 } }));
    executeActionMock
      .mockResolvedValueOnce(successResult("field_visit", "visit-2"))
      .mockResolvedValueOnce(successResult("order", "order-1"));

    const result = await processFieldVisitReport({ authContext, message: "Arde Yapı 2 palet ürün sipariş geçti." });

    expect(executeActionMock).toHaveBeenCalledTimes(2);
    expect(executeActionMock.mock.calls[1]![0]).toMatchObject({ actionName: "order.create", input: { customerId: "cust-1", notes: expect.stringContaining("2 adet") } });
    expect(linkFieldVisitOutcomeByIdMock).toHaveBeenCalledWith("visit-2", "org-1", { relatedOrderId: "order-1", relatedPaymentId: undefined });
    expect(result).toMatchObject({ orderCreated: true, paymentCreated: false });
  });

  it("creates a pending payment and links it back when a payment intent is stated", async () => {
    parseFieldVisitReportMock.mockResolvedValue(extraction({ paymentIntent: { amount: 10000, currency: "TRY" } }));
    executeActionMock
      .mockResolvedValueOnce(successResult("field_visit", "visit-3"))
      .mockResolvedValueOnce(successResult("payment", "payment-1"));

    const result = await processFieldVisitReport({ authContext, message: "Arde Yapı 10.000 TL ödeme yaptı." });

    expect(executeActionMock.mock.calls[1]![0]).toMatchObject({ actionName: "payment.create", input: { customerId: "cust-1", amount: 10000, currency: "TRY" } });
    expect(linkFieldVisitOutcomeByIdMock).toHaveBeenCalledWith("visit-3", "org-1", { relatedOrderId: undefined, relatedPaymentId: "payment-1" });
    expect(result).toMatchObject({ orderCreated: false, paymentCreated: true });
  });

  it("never fabricates an order/payment when the customer can't be resolved, and records why on the visit", async () => {
    listCustomersMock.mockResolvedValue([]);
    parseFieldVisitReportMock.mockResolvedValue(extraction({ paymentIntent: { amount: 5000, currency: "TRY" } }));
    executeActionMock.mockResolvedValueOnce(successResult("field_visit", "visit-4"));

    const result = await processFieldVisitReport({ authContext, message: "Bilinmeyen Firma 5.000 TL ödeme yaptı." });

    expect(executeActionMock).toHaveBeenCalledTimes(1);
    expect(executeActionMock.mock.calls[0]![0]).toMatchObject({ input: expect.objectContaining({ unresolvedIntent: expect.stringContaining("otomatik oluşturulamadı") }) });
    expect(linkFieldVisitOutcomeByIdMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "LOGGED", customerResolved: false, orderCreated: false, paymentCreated: false });
  });

  it("throws when field_visit.create itself fails, so no order/payment is attempted", async () => {
    parseFieldVisitReportMock.mockResolvedValue(extraction());
    executeActionMock.mockResolvedValueOnce({ status: "FAILED", outcome: "HANDLER_ERROR" });

    await expect(processFieldVisitReport({ authContext, message: "x" })).rejects.toThrow(/field_visit\.create failed/);
    expect(executeActionMock).toHaveBeenCalledTimes(1);
  });
});
