import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireAuthContextFromCookiesMock, generateCustomerEditCommandTextMock } = vi.hoisted(() => ({
  requireAuthContextFromCookiesMock: vi.fn(),
  generateCustomerEditCommandTextMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards/api-auth-guard", () => ({
  requireAuthContextFromCookies: requireAuthContextFromCookiesMock,
}));

vi.mock("@/lib/customers/customer-edit-command-ai-adapter", () => ({
  generateCustomerEditCommandText: generateCustomerEditCommandTextMock,
}));

// mapExecutionErrorToHttpResponse (imported by route.ts) pulls in
// domains/customers -> customer.service -> the real Prisma client, which
// throws at import time without DATABASE_URL. No test here touches Prisma.
vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})),
  },
}));

import { AuthError } from "@/lib/auth/shared/auth.errors";
import { POST } from "../route";

const FAKE_AUTH_CONTEXT = {
  user: { id: "user_1" },
  organization: { id: "org_1" },
  membership: { role: "MANAGER" },
  session: { id: "session_1", createdAt: new Date("2026-01-01T00:00:00.000Z"), expiresAt: new Date("2026-01-01T01:00:00.000Z") },
};

function buildRequest(body: Record<string, unknown> | string): Request {
  return new Request("http://localhost/api/customers/cust_1/actions/edit-command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function ctx(customerId = "cust_1") {
  return { params: Promise.resolve({ customerId }) };
}

describe("POST /api/customers/[customerId]/actions/edit-command", () => {
  beforeEach(() => {
    requireAuthContextFromCookiesMock.mockReset().mockResolvedValue(FAKE_AUTH_CONTEXT);
    generateCustomerEditCommandTextMock.mockReset();
  });

  it("returns a resolved executable outcome for a valid request", async () => {
    generateCustomerEditCommandTextMock.mockResolvedValue(
      JSON.stringify({ result: "executable", action: "set_field", field: "phone", value: "0532 111 22 33" }),
    );

    const res = await POST(buildRequest({ utterance: "Telefonu 0532 111 22 33 yap.", activeTab: "identity" }), ctx());
    const json = (await res.json()) as { ok: true; data: { outcome: { kind: string } } };

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.outcome.kind).toBe("resolved");
  });

  it("returns invalid_output when the model output does not validate", async () => {
    generateCustomerEditCommandTextMock.mockResolvedValue("not json at all");

    const res = await POST(buildRequest({ utterance: "Bir seyler yap.", activeTab: "identity" }), ctx());
    const json = (await res.json()) as { ok: true; data: { outcome: { kind: string } } };

    expect(json.data.outcome.kind).toBe("invalid_output");
  });

  it("rejects a request missing utterance with 400", async () => {
    const res = await POST(buildRequest({ activeTab: "identity" }), ctx());
    expect(res.status).toBe(400);
  });

  it("propagates an auth failure as its mapped status", async () => {
    requireAuthContextFromCookiesMock.mockRejectedValue(new AuthError("Unauthorized.", 401));

    const res = await POST(buildRequest({ utterance: "Telefonu degistir.", activeTab: "identity" }), ctx());

    expect(res.status).toBe(401);
    expect(generateCustomerEditCommandTextMock).not.toHaveBeenCalled();
  });
});
