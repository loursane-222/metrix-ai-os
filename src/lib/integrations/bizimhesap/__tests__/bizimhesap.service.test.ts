import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@/lib/core/shared/prisma", () => ({ prisma: { integrationConnection: db } }));

const client = vi.hoisted(() => ({
  bizimHesapAddInvoice: vi.fn(),
  bizimHesapListProducts: vi.fn(),
  bizimHesapListWarehouses: vi.fn(),
  bizimHesapVerifyCredentials: vi.fn(),
}));
vi.mock("../bizimhesap-client", () => client);

process.env.INTEGRATION_SECRET_ENCRYPTION_KEY = "0".repeat(64);

const { encryptIntegrationSecret } = await import("../../integration-secret-crypto");
const {
  connectBizimHesap,
  disconnectBizimHesap,
  getBizimHesapStatus,
  pushInvoiceToBizimHesap,
  syncBizimHesapCatalog,
} = await import("../bizimhesap.service");

beforeEach(() => {
  vi.clearAllMocks();
  db.update.mockResolvedValue({});
});

describe("connectBizimHesap", () => {
  it("verifies the token against the real API before ever storing it", async () => {
    client.bizimHesapVerifyCredentials.mockResolvedValue(undefined);
    db.upsert.mockResolvedValue({});
    await connectBizimHesap({ organizationId: "org-1", credentials: { token: "t-1" } });
    expect(client.bizimHesapVerifyCredentials).toHaveBeenCalledWith({ token: "t-1" });
    expect(db.upsert).toHaveBeenCalled();
  });

  it("never stores a credential when verification fails", async () => {
    client.bizimHesapVerifyCredentials.mockRejectedValue(new Error("BIZIMHESAP_401"));
    await expect(connectBizimHesap({ organizationId: "org-1", credentials: { token: "bad" } })).rejects.toThrow("BIZIMHESAP_401");
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it("rejects an empty token before making any network call", async () => {
    await expect(connectBizimHesap({ organizationId: "org-1", credentials: { token: "  " } })).rejects.toThrow("BIZIMHESAP_TOKEN_MISSING");
    expect(client.bizimHesapVerifyCredentials).not.toHaveBeenCalled();
  });
});

describe("getBizimHesapStatus", () => {
  it("reports NOT_CONNECTED when no connection row exists", async () => {
    db.findUnique.mockResolvedValue(null);
    expect(await getBizimHesapStatus("org-1")).toMatchObject({ connected: false, status: "NOT_CONNECTED" });
  });

  it("reports CONNECTED with real timestamps from the stored row", async () => {
    db.findUnique.mockResolvedValue({ status: "CONNECTED", connectedAt: new Date("2026-08-24T00:00:00Z"), lastSuccessfulSyncAt: new Date("2026-08-24T01:00:00Z"), lastErrorCode: null });
    const status = await getBizimHesapStatus("org-1");
    expect(status.connected).toBe(true);
    expect(status.lastSuccessfulSyncAt).toBe("2026-08-24T01:00:00.000Z");
  });
});

describe("disconnectBizimHesap", () => {
  it("deletes the org's connection row", async () => {
    db.deleteMany.mockResolvedValue({ count: 1 });
    await disconnectBizimHesap("org-1");
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "org-1", provider: "bizimhesap" } });
  });
});

describe("syncBizimHesapCatalog", () => {
  it("throws when there is no connection to sync", async () => {
    db.findUnique.mockResolvedValue(null);
    await expect(syncBizimHesapCatalog("org-1")).rejects.toThrow("BIZIMHESAP_NOT_CONNECTED");
  });

  it("returns a read-only snapshot and records the successful sync time", async () => {
    db.findUnique.mockResolvedValue({ id: "conn-1", credentialsEncrypted: encryptIntegrationSecret(JSON.stringify({ token: "t-1" })) });
    client.bizimHesapListProducts.mockResolvedValue([{ id: "p-1" }]);
    client.bizimHesapListWarehouses.mockResolvedValue([{ id: "w-1" }]);

    const snapshot = await syncBizimHesapCatalog("org-1");

    expect(snapshot.products).toEqual([{ id: "p-1" }]);
    expect(snapshot.warehouses).toEqual([{ id: "w-1" }]);
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CONNECTED" }) }));
  });

  it("marks the connection ERROR and rethrows when the remote call fails", async () => {
    db.findUnique.mockResolvedValue({ id: "conn-1", credentialsEncrypted: encryptIntegrationSecret(JSON.stringify({ token: "t-1" })) });
    client.bizimHesapListProducts.mockRejectedValue(new Error("BIZIMHESAP_500"));
    client.bizimHesapListWarehouses.mockResolvedValue([]);

    await expect(syncBizimHesapCatalog("org-1")).rejects.toThrow("BIZIMHESAP_500");
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "ERROR" }) }));
  });
});

describe("pushInvoiceToBizimHesap", () => {
  const baseInput = {
    organizationId: "org-1",
    invoice: {
      invoiceNumber: "INV-1",
      title: "Teklif Faturası",
      amount: 1000,
      taxRate: 20,
      taxAmount: 200,
      totalAmount: 1200,
      currency: "TRY",
      dueDate: null,
      items: [{ name: "Teklif Faturası", quantity: 1, unitPriceCents: BigInt(100000), discountBasisPoints: 0, vatRateBasisPoints: 2000 }],
    },
    customer: { id: "c-1", displayName: "Atlas", legalName: "Atlas İnşaat Ltd.", taxOffice: "Kadıköy", taxNumber: "1234567890", email: null, phone: null, addressLine: null },
  };

  it("throws when there is no connection", async () => {
    db.findUnique.mockResolvedValue(null);
    await expect(pushInvoiceToBizimHesap(baseInput)).rejects.toThrow("BIZIMHESAP_NOT_CONNECTED");
  });

  it("throws when the connection has no firmId configured", async () => {
    db.findUnique.mockResolvedValue({ id: "conn-1", credentialsEncrypted: encryptIntegrationSecret(JSON.stringify({ token: "t-1" })) });
    await expect(pushInvoiceToBizimHesap(baseInput)).rejects.toThrow("BIZIMHESAP_FIRM_ID_MISSING");
  });

  it("maps METRIX's single-amount invoice into one BizimHesap invoice line and converts TRY to TL", async () => {
    db.findUnique.mockResolvedValue({ id: "conn-1", credentialsEncrypted: encryptIntegrationSecret(JSON.stringify({ token: "t-1", firmId: "firm-1" })) });
    client.bizimHesapAddInvoice.mockResolvedValue({ guid: "g-1", url: "https://bizimhesap.com/x" });

    const result = await pushInvoiceToBizimHesap(baseInput);

    expect(result).toEqual({ guid: "g-1", url: "https://bizimhesap.com/x" });
    const [, payload] = client.bizimHesapAddInvoice.mock.calls[0];
    expect(payload.firmId).toBe("firm-1");
    expect(payload.amounts.currency).toBe("TL");
    expect(payload.amounts.total).toBe(1200);
    expect(payload.details).toHaveLength(1);
    expect(payload.customer.title).toBe("Atlas İnşaat Ltd.");
    expect(payload.customer.taxNo).toBe("1234567890");
  });

  it("rejects an unsupported currency before calling the API", async () => {
    db.findUnique.mockResolvedValue({ id: "conn-1", credentialsEncrypted: encryptIntegrationSecret(JSON.stringify({ token: "t-1", firmId: "firm-1" })) });
    await expect(pushInvoiceToBizimHesap({ ...baseInput, invoice: { ...baseInput.invoice, currency: "JPY" } })).rejects.toThrow("BIZIMHESAP_UNSUPPORTED_CURRENCY");
    expect(client.bizimHesapAddInvoice).not.toHaveBeenCalled();
  });

  it("MIXED VAT: sends each line's own tax rate instead of collapsing to one blended Invoice.taxRate", async () => {
    db.findUnique.mockResolvedValue({ id: "conn-1", credentialsEncrypted: encryptIntegrationSecret(JSON.stringify({ token: "t-1", firmId: "firm-1" })) });
    client.bizimHesapAddInvoice.mockResolvedValue({ guid: "g-1", url: "https://bizimhesap.com/x" });

    // Line A: 100.00 net, 0% VAT. Line B: 100.00 net, 20% VAT. Header
    // taxRate would blend to a single misleading 10% if collapsed.
    const mixedVatInput = {
      ...baseInput,
      invoice: {
        ...baseInput.invoice,
        amount: 200,
        taxRate: 10,
        taxAmount: 20,
        totalAmount: 220,
        items: [
          { name: "Line A (0% VAT)", quantity: 1, unitPriceCents: BigInt(10000), discountBasisPoints: 0, vatRateBasisPoints: 0 },
          { name: "Line B (20% VAT)", quantity: 1, unitPriceCents: BigInt(10000), discountBasisPoints: 0, vatRateBasisPoints: 2000 },
        ],
      },
    };

    await pushInvoiceToBizimHesap(mixedVatInput);

    const [, payload] = client.bizimHesapAddInvoice.mock.calls[0];
    expect(payload.details).toHaveLength(2);
    expect(payload.details[0]).toMatchObject({ productName: "Line A (0% VAT)", taxRate: 0 });
    expect(payload.details[1]).toMatchObject({ productName: "Line B (20% VAT)", taxRate: 20 });
    // Line-level totals must reconcile exactly with the header (never a
    // silent mismatch sent to a real external accounting system).
    const sumOfLineTotals = payload.details.reduce((sum: number, line: { total: number }) => sum + line.total, 0);
    expect(sumOfLineTotals).toBeCloseTo(payload.amounts.total, 5);
  });

  it("FAIL-CLOSED: refuses to push an invoice with no InvoiceItem rows rather than synthesizing a fake line", async () => {
    db.findUnique.mockResolvedValue({ id: "conn-1", credentialsEncrypted: encryptIntegrationSecret(JSON.stringify({ token: "t-1", firmId: "firm-1" })) });

    await expect(pushInvoiceToBizimHesap({ ...baseInput, invoice: { ...baseInput.invoice, items: [] } })).rejects.toThrow("BIZIMHESAP_PUSH_NO_LINE_ITEMS");
    expect(client.bizimHesapAddInvoice).not.toHaveBeenCalled();
  });
});
