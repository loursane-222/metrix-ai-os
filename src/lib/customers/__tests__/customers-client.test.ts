import { describe, expect, it, vi, beforeEach } from "vitest";

import { createCustomer } from "../customers-client";

describe("createCustomer", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("posts the body to /api/customers and returns the created customer", async () => {
    const customer = { id: "cus-1", displayName: "Acme Ltd" };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data: { customer } }), { status: 201 }),
    );

    const result = await createCustomer({ displayName: "Acme Ltd" });

    expect(fetch).toHaveBeenCalledWith(
      "/api/customers",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ displayName: "Acme Ltd" }),
      }),
    );
    expect(result).toEqual({ ok: true, data: { customer } });
  });

  it("surfaces the API error message when creation fails", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, error: { message: "A customer with this identity already exists: Acme Ltd." } }),
        { status: 400 },
      ),
    );

    const result = await createCustomer({ displayName: "Acme Ltd" });

    expect(result).toEqual({ ok: false, error: "A customer with this identity already exists: Acme Ltd." });
  });
});
