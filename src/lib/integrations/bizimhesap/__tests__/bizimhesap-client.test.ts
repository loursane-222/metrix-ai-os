import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bizimHesapAddInvoice,
  bizimHesapGetStock,
  bizimHesapListProducts,
  bizimHesapListWarehouses,
  bizimHesapVerifyCredentials,
} from "../bizimhesap-client";

const credentials = { token: "merchant-token" };

function mockFetchOnce(status: number, body: unknown): void {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch;
}

describe("bizimhesap-client", () => {
  beforeEach(() => {
    process.env.BIZIMHESAP_PARTNER_KEY = "partner-key";
  });

  it("sends the Key and Token headers on every request", async () => {
    mockFetchOnce(200, []);
    await bizimHesapListWarehouses(credentials);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://bizimhesap.com/api/b2b/warehouses");
    expect((init.headers as Record<string, string>).Key).toBe("partner-key");
    expect((init.headers as Record<string, string>).Token).toBe("merchant-token");
  });

  it("throws when the partner key env var is not configured", async () => {
    delete process.env.BIZIMHESAP_PARTNER_KEY;
    await expect(bizimHesapListWarehouses(credentials)).rejects.toThrow("BIZIMHESAP_PARTNER_KEY");
  });

  it("posts the full invoice payload to addinvoice and returns guid/url on success", async () => {
    mockFetchOnce(200, { error: "", guid: "g-1", url: "https://bizimhesap.com/x" });
    const result = await bizimHesapAddInvoice(credentials, {
      firmId: "firm-1", invoiceType: 3,
      dates: { invoiceDate: "2026-08-24T00:00:00Z", dueDate: "2026-09-01T00:00:00Z" },
      customer: { customerId: "c-1", title: "Atlas İnşaat", address: "" },
      details: [{ productId: "p-1", productName: "Fatura", taxRate: 20, quantity: 1, unitPrice: 100, grossPrice: 100, discount: 0, net: 100, tax: 20, total: 120 }],
      amounts: { currency: "TL", gross: 100, discount: 0, net: 100, tax: 20, total: 120 },
    });
    expect(result).toEqual({ guid: "g-1", url: "https://bizimhesap.com/x" });
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).firmId).toBe("firm-1");
  });

  it("throws BIZIMHESAP_INVOICE_REJECTED when the API reports a business error even on HTTP 200", async () => {
    mockFetchOnce(200, { error: "Hatalı para birimi", guid: "", url: "" });
    await expect(bizimHesapAddInvoice(credentials, {
      firmId: "firm-1", invoiceType: 3,
      dates: { invoiceDate: "2026-08-24T00:00:00Z", dueDate: "2026-09-01T00:00:00Z" },
      customer: { customerId: "c-1", title: "Atlas", address: "" },
      details: [], amounts: { currency: "TL", gross: 0, discount: 0, net: 0, tax: 0, total: 0 },
    })).rejects.toThrow("Hatalı para birimi");
  });

  it("throws a tagged error on a non-2xx HTTP status", async () => {
    mockFetchOnce(401, { error: "unauthorized" });
    await expect(bizimHesapListProducts(credentials)).rejects.toThrow("BIZIMHESAP_401");
  });

  it("returns an empty array instead of throwing when the response isn't a JSON array", async () => {
    mockFetchOnce(200, { unexpected: "shape" });
    expect(await bizimHesapListProducts(credentials)).toEqual([]);
  });

  it("builds the warehouse-scoped inventory path for stock retrieval", async () => {
    mockFetchOnce(200, [{ productId: "p-1", quantity: 5 }]);
    const stock = await bizimHesapGetStock(credentials, "depo-1");
    expect(stock).toEqual([{ productId: "p-1", quantity: 5 }]);
    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://bizimhesap.com/api/b2b/inventory/depo-1");
  });

  it("verifies credentials by calling the read-only warehouses endpoint, never a mutating one", async () => {
    mockFetchOnce(200, []);
    await bizimHesapVerifyCredentials(credentials);
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://bizimhesap.com/api/b2b/warehouses");
    expect(init.method).toBe("GET");
  });
});
