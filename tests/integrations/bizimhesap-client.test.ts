import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BizimHesapRequestError,
  BIZIMHESAP_B2B_KEY,
  bizimHesapFailureReason,
  bizimHesapGetStock,
  bizimHesapListProducts,
  bizimHesapListWarehouses,
  bizimHesapVerifyCredentials,
  type FetchLike
} from "../../src/lib/integrations/bizimhesap/bizimhesap-client";

afterEach(() => {
  vi.restoreAllMocks();
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
  it("uses BizimHesap's published protocol Key as a constant — no environment configuration is read or needed", async () => {
    const original = process.env.BIZIMHESAP_PARTNER_KEY;
    delete process.env.BIZIMHESAP_PARTNER_KEY;

    try {
      const { fetchImpl, calls } = mockFetch({ status: 200, body: [] });
      await bizimHesapListWarehouses({ token: "merchant-token" }, fetchImpl);
      expect(calls[0]?.headers?.Key).toBe("BZMHB2B724018943908D0B82491F203F");
      expect(BIZIMHESAP_B2B_KEY).toBe("BZMHB2B724018943908D0B82491F203F");

      // A stale/unrelated environment value must not change the protocol.
      process.env.BIZIMHESAP_PARTNER_KEY = "something-else";
      await bizimHesapListWarehouses({ token: "merchant-token" }, fetchImpl);
      expect(calls[1]?.headers?.Key).toBe("BZMHB2B724018943908D0B82491F203F");
    } finally {
      if (original === undefined) delete process.env.BIZIMHESAP_PARTNER_KEY;
      else process.env.BIZIMHESAP_PARTNER_KEY = original;
    }
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
      Key: "BZMHB2B724018943908D0B82491F203F",
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

  it("never reads a non-list body as an empty list — a 200 error object is not a proven connection", async () => {
    const { fetchImpl } = mockFetch({
      status: 200,
      body: { error: "invalid token" }
    });

    await expect(
      bizimHesapVerifyCredentials({ token: "t" }, fetchImpl)
    ).rejects.toMatchObject({ code: "UNEXPECTED_RESPONSE_SHAPE" });
  });

  it("turns a transport failure into a coded request error carrying no request detail", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error("connect ECONNREFUSED with-secret-merchant-token");
    };

    const error = await bizimHesapListWarehouses(
      { token: "with-secret-merchant-token" },
      fetchImpl
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BizimHesapRequestError);
    expect((error as BizimHesapRequestError).code).toBe("NETWORK_ERROR");
    expect(String((error as Error).message)).not.toContain("with-secret-merchant-token");
  });

  it("classifies rejection vs provider/network unavailability", () => {
    expect(bizimHesapFailureReason(new BizimHesapRequestError("HTTP_401", 401))).toBe("CREDENTIALS_REJECTED");
    expect(bizimHesapFailureReason(new BizimHesapRequestError("HTTP_403", 403))).toBe("CREDENTIALS_REJECTED");
    expect(bizimHesapFailureReason(new BizimHesapRequestError("UNEXPECTED_RESPONSE_SHAPE"))).toBe("CREDENTIALS_REJECTED");
    expect(bizimHesapFailureReason(new BizimHesapRequestError("HTTP_500", 500))).toBe("PROVIDER_UNAVAILABLE");
    expect(bizimHesapFailureReason(new BizimHesapRequestError("HTTP_429", 429))).toBe("PROVIDER_UNAVAILABLE");
    expect(bizimHesapFailureReason(new BizimHesapRequestError("NETWORK_ERROR"))).toBe("PROVIDER_UNAVAILABLE");
  });

  it("sends the merchant token only in the Token header, on every endpoint", async () => {
    const { fetchImpl, calls } = mockFetch({ status: 200, body: [] });

    await bizimHesapListWarehouses({ token: "SENTINEL-token-1" }, fetchImpl);
    await bizimHesapListProducts({ token: "SENTINEL-token-1" }, fetchImpl);
    await bizimHesapGetStock({ token: "SENTINEL-token-1" }, "w1", fetchImpl);

    for (const call of calls) {
      expect(call.headers?.Token).toBe("SENTINEL-token-1");
      expect(call.headers?.Key).toBe(BIZIMHESAP_B2B_KEY);
      expect(call.url).not.toContain("SENTINEL-token-1");
    }
  });

  it("emits schema-only diagnostics on an unrecognised body: key names and structure, never a value, header or token", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const other = (["log", "info", "error", "debug"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined)
    );

    const { fetchImpl } = mockFetch({
      status: 200,
      body: { data: [{ VALUE_SENTINEL: "secret-customer-value" }], total: 1 }
    });

    await expect(
      bizimHesapListWarehouses({ token: "SENTINEL-token-2" }, fetchImpl)
    ).rejects.toMatchObject({ code: "UNEXPECTED_RESPONSE_SHAPE" });

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("[bizimhesap:schema]");
    expect(logged).toContain('\\"topLevel\\":\\"object\\"');
    expect(logged).toContain('\\"listKeys\\":[\\"data\\"]');
    expect(logged).toContain("/warehouses");

    for (const secret of ["secret-customer-value", "SENTINEL-token-2", BIZIMHESAP_B2B_KEY, "VALUE_SENTINEL"]) {
      expect(logged).not.toContain(secret);
    }
    for (const spy of other) expect(spy).not.toHaveBeenCalled();
  });

  it("logs the HTTP status and body structure of a rejected call, still without values", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { fetchImpl } = mockFetch({ status: 401, body: { error: "leaky-provider-text" } });

    await expect(
      bizimHesapListWarehouses({ token: "SENTINEL-token-3" }, fetchImpl)
    ).rejects.toMatchObject({ code: "HTTP_401" });

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('\\"status\\":401');
    expect(logged).toContain('\\"keys\\":[\\"error\\"]');
    expect(logged).not.toContain("leaky-provider-text");
    expect(logged).not.toContain("SENTINEL-token-3");
  });

  it("classifies the real API's observed rejection (HTTP 401, {\"Message\": \"Authorization has been denied…\"}) as a rejected credential", async () => {
    // Observed 2026-09-19 from the live endpoint with the documented Key and
    // an intentionally invalid Token — no merchant data involved.
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { fetchImpl } = mockFetch({
      status: 401,
      body: { Message: "Authorization has been denied for this request." }
    });

    const error = await bizimHesapVerifyCredentials({ token: "invalid" }, fetchImpl).catch(
      (caught: unknown) => caught
    );

    expect(error).toBeInstanceOf(BizimHesapRequestError);
    expect(bizimHesapFailureReason(error as BizimHesapRequestError)).toBe("CREDENTIALS_REJECTED");
  });
});
