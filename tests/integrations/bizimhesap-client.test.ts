import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BizimHesapRequestError,
  MissingPartnerKeyError,
  bizimHesapGetStock,
  bizimHesapListProducts,
  bizimHesapListWarehouses,
  bizimHesapVerifyCredentials,
  type FetchLike
} from "../../src/lib/integrations/bizimhesap/bizimhesap-client";

const ORIGINAL_PARTNER_KEY = process.env.BIZIMHESAP_PARTNER_KEY;

beforeEach(() => {
  process.env.BIZIMHESAP_PARTNER_KEY = "test-partner-key";
});

afterEach(() => {
  process.env.BIZIMHESAP_PARTNER_KEY = ORIGINAL_PARTNER_KEY;
});

function mockFetch(
  response: { status: number; body: unknown }
): { fetchImpl: FetchLike; calls: Array<{ url: string; headers?: Record<string, string> }> } {
  const calls: Array<{ url: string; headers?: Record<string, string> }> = [];

  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers });

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body
    };
  };

  return { fetchImpl, calls };
}

describe("bizimhesap-client (ported adapter, mocked HTTP)", () => {
  it("throws MissingPartnerKeyError when BIZIMHESAP_PARTNER_KEY is unset", async () => {
    delete process.env.BIZIMHESAP_PARTNER_KEY;

    const { fetchImpl } = mockFetch({ status: 200, body: [] });

    await expect(
      bizimHesapListWarehouses({ token: "t" }, fetchImpl)
    ).rejects.toBeInstanceOf(MissingPartnerKeyError);
  });

  it("sends Key + Token headers and the exact documented endpoint paths", async () => {
    const { fetchImpl, calls } = mockFetch({
      status: 200,
      body: [{ id: "w1", name: "Merkez Depo" }]
    });

    const warehouses = await bizimHesapListWarehouses(
      { token: "merchant-token" },
      fetchImpl
    );

    expect(warehouses).toEqual([{ id: "w1", name: "Merkez Depo" }]);
    expect(calls[0]?.url).toBe(
      "https://bizimhesap.com/api/b2b/warehouses"
    );
    expect(calls[0]?.headers).toMatchObject({
      Key: "test-partner-key",
      Token: "merchant-token"
    });

    await bizimHesapListProducts({ token: "merchant-token" }, fetchImpl);
    expect(calls[1]?.url).toBe(
      "https://bizimhesap.com/api/b2b/products"
    );

    await bizimHesapGetStock(
      { token: "merchant-token" },
      "w1",
      fetchImpl
    );
    expect(calls[2]?.url).toBe(
      "https://bizimhesap.com/api/b2b/inventory/w1"
    );
  });

  it("throws BizimHesapRequestError on a non-2xx response", async () => {
    const { fetchImpl } = mockFetch({ status: 401, body: {} });

    await expect(
      bizimHesapListWarehouses({ token: "bad" }, fetchImpl)
    ).rejects.toBeInstanceOf(BizimHesapRequestError);
  });

  it("verifyCredentials succeeds when the warehouses call succeeds", async () => {
    const { fetchImpl } = mockFetch({ status: 200, body: [] });

    await expect(
      bizimHesapVerifyCredentials({ token: "ok" }, fetchImpl)
    ).resolves.toBe(true);
  });

  it("filters out non-object array entries defensively", async () => {
    const { fetchImpl } = mockFetch({
      status: 200,
      body: [{ id: "1" }, "not-an-object", null, 42]
    });

    const products = await bizimHesapListProducts(
      { token: "t" },
      fetchImpl
    );

    expect(products).toEqual([{ id: "1" }]);
  });
});
