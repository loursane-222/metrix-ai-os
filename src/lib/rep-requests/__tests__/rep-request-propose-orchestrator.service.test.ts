import { beforeEach, describe, expect, it, vi } from "vitest";

const { parseRepRequestMock, listCustomersMock, persistBusinessPropositionsMock, listActiveNotificationRecipientRecordsMock, notifyMock } = vi.hoisted(() => ({
  parseRepRequestMock: vi.fn(),
  listCustomersMock: vi.fn(),
  persistBusinessPropositionsMock: vi.fn(),
  listActiveNotificationRecipientRecordsMock: vi.fn(),
  notifyMock: vi.fn(),
}));

vi.mock("../rep-request-parser.service", () => ({ parseRepRequest: parseRepRequestMock }));
vi.mock("@/lib/core/customers/customer.service", () => ({ listCustomers: listCustomersMock }));
vi.mock("@/lib/business-reality-candidates", () => ({ persistBusinessPropositions: persistBusinessPropositionsMock }));
vi.mock("@/lib/core/organization-members/organization-member.repository", () => ({
  listActiveNotificationRecipientRecords: listActiveNotificationRecipientRecordsMock,
}));
vi.mock("@/lib/core/notifications/notification.service", () => ({ notify: notifyMock }));
// rep-request.repository.ts (imported for its pure targetDomain/label
// helpers) also imports the real prisma client at module scope, which
// throws without DATABASE_URL — nothing in this test touches the DB.
vi.mock("@/lib/core/shared/prisma", () => ({ prisma: {} }));

import { proposeRepRequest } from "../rep-request-propose-orchestrator.service";

const authContext = (userId = "user-1", fullName: string | null = "Ahmet Yılmaz") => ({
  user: { id: userId, fullName },
  organization: { id: "org-1" },
} as never);

const customers = [{ id: "customer-1", displayName: "Atlas İnşaat", legalName: null, phone: null, email: null, cariKodu: null, taxNumber: null }];

describe("proposeRepRequest", () => {
  beforeEach(() => {
    parseRepRequestMock.mockReset();
    listCustomersMock.mockReset().mockResolvedValue(customers);
    persistBusinessPropositionsMock.mockReset().mockResolvedValue([{}]);
    listActiveNotificationRecipientRecordsMock.mockReset().mockResolvedValue([]);
    notifyMock.mockReset().mockResolvedValue({});
  });

  it("returns PARSE_FAILED when nothing could be extracted", async () => {
    parseRepRequestMock.mockResolvedValue(null);
    const result = await proposeRepRequest({ authContext: authContext(), domain: "ORDER", message: "belirsiz mesaj" });
    expect(result).toEqual({ status: "PARSE_FAILED" });
    expect(persistBusinessPropositionsMock).not.toHaveBeenCalled();
  });

  it("returns PARSE_FAILED for a QUOTE with no amount, without creating a candidate", async () => {
    parseRepRequestMock.mockResolvedValue({ customerNameRaw: "Atlas İnşaat", title: "Teklif", amount: null, currency: null, notes: null, deadlineAt: null });
    const result = await proposeRepRequest({ authContext: authContext(), domain: "QUOTE", message: "x" });
    expect(result).toEqual({ status: "PARSE_FAILED" });
    expect(persistBusinessPropositionsMock).not.toHaveBeenCalled();
  });

  it("returns CUSTOMER_NOT_FOUND without creating a candidate", async () => {
    parseRepRequestMock.mockResolvedValue({ customerNameRaw: "Bilinmeyen Firma", title: null, amount: null, currency: null, notes: null, deadlineAt: null });
    const result = await proposeRepRequest({ authContext: authContext(), domain: "ORDER", message: "x" });
    expect(result).toEqual({ status: "CUSTOMER_NOT_FOUND", customerNameRaw: "Bilinmeyen Firma" });
    expect(persistBusinessPropositionsMock).not.toHaveBeenCalled();
  });

  it("creates an ORDER candidate (no amount required) and notifies every active manager, not employees", async () => {
    parseRepRequestMock.mockResolvedValue({ customerNameRaw: "Atlas İnşaat", title: null, amount: null, currency: null, notes: "50 adet çimento", deadlineAt: null });
    listActiveNotificationRecipientRecordsMock.mockResolvedValue([
      { userId: "manager-1", fullName: "Yönetici Bir", role: "MANAGER" },
      { userId: "employee-1", fullName: "Çalışan Bir", role: "EMPLOYEE" },
    ]);

    const result = await proposeRepRequest({ authContext: authContext(), domain: "ORDER", message: "Atlas İnşaat için sipariş, onaya gönder." });

    expect(result).toEqual({ status: "PROPOSED", domain: "ORDER", customerNameRaw: "Atlas İnşaat" });
    const call = persistBusinessPropositionsMock.mock.calls[0]![0];
    expect(call.propositions[0].targetDomain).toBe("Order");
    expect(call.propositions[0].provenance).toEqual({ proposedByUserId: "user-1", channel: "chat" });
    expect(call.propositions[0].changes).toEqual(expect.arrayContaining([
      { fieldPath: "customerId", proposedValue: "customer-1" },
      { fieldPath: "notes", proposedValue: "50 adet çimento" },
    ]));
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: "manager-1", type: "REP_REQUEST_PROPOSED" }));
  });

  it("encodes amount as a string in the candidate change (executor requires string proposedValue)", async () => {
    parseRepRequestMock.mockResolvedValue({ customerNameRaw: "Atlas İnşaat", title: "Tahsilat", amount: 10000, currency: null, notes: null, deadlineAt: null });
    await proposeRepRequest({ authContext: authContext(), domain: "PAYMENT", message: "x" });

    const call = persistBusinessPropositionsMock.mock.calls[0]![0];
    const amountChange = call.propositions[0].changes.find((change: { fieldPath: string }) => change.fieldPath === "amount");
    expect(amountChange).toEqual({ fieldPath: "amount", proposedValue: "10000" });
  });
});
