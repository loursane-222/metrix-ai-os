import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireAuthContextFromCookiesMock, executeCustomerUpdateGatewayMock } = vi.hoisted(() => ({
  requireAuthContextFromCookiesMock: vi.fn(),
  executeCustomerUpdateGatewayMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards/api-auth-guard", () => ({
  requireAuthContextFromCookies: requireAuthContextFromCookiesMock,
}));

vi.mock("@/lib/action-runtime/gateway/customer-update-gateway", () => ({
  executeCustomerUpdateGateway: executeCustomerUpdateGatewayMock,
}));

// mapExecutionErrorToHttpResponse (imported by route.ts) pulls in
// domains/customers -> customer.service -> the real Prisma client, which
// throws at import time without DATABASE_URL. No test here touches Prisma.
vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})),
  },
}));

import {
  ApprovalRequiredError,
  ExecutionFailedError,
  PolicyDeniedError,
} from "@/lib/action-runtime/execution";
import { CustomerVersionConflictError } from "@/lib/action-runtime/domains/customers";
import { AuthError } from "@/lib/auth/shared/auth.errors";

import { POST } from "../route";

const FAKE_AUTH_CONTEXT = {
  user: { id: "user_1" },
  organization: { id: "org_1" },
  membership: { role: "MANAGER" },
  session: { id: "session_1", createdAt: new Date("2026-01-01T00:00:00.000Z"), expiresAt: new Date("2026-01-01T01:00:00.000Z") },
};

function buildRequest(params: {
  body?: Record<string, unknown> | string;
  idempotencyKey?: string | null;
  correlationId?: string;
}): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (params.idempotencyKey !== undefined && params.idempotencyKey !== null) {
    headers.set("Idempotency-Key", params.idempotencyKey);
  }
  if (params.correlationId) {
    headers.set("X-Correlation-Id", params.correlationId);
  }

  const body =
    typeof params.body === "string"
      ? params.body
      : JSON.stringify(
          params.body ?? {
            patch: { displayName: "New Name" },
            expectedVersion: "2026-01-01T00:00:00.000Z",
            originatingDraftId: "draft_1",
            originatingContextVersion: 1,
          },
        );

  return new Request("http://localhost/api/customers/cust_1/actions/update", {
    method: "POST",
    headers,
    body,
  });
}

function ctx(customerId = "cust_1") {
  return { params: Promise.resolve({ customerId }) };
}

describe("POST /api/customers/[customerId]/actions/update", () => {
  beforeEach(() => {
    requireAuthContextFromCookiesMock.mockReset().mockResolvedValue(FAKE_AUTH_CONTEXT);
    executeCustomerUpdateGatewayMock.mockReset();
  });

  it("rejects a request with no Idempotency-Key header with 400", async () => {
    const response = await POST(buildRequest({ idempotencyKey: undefined }), ctx());
    expect(response.status).toBe(400);
    expect(executeCustomerUpdateGatewayMock).not.toHaveBeenCalled();
  });

  it("rejects a request with an empty Idempotency-Key header with 400", async () => {
    const response = await POST(buildRequest({ idempotencyKey: "   " }), ctx());
    expect(response.status).toBe(400);
  });

  it("rejects malformed JSON with 400", async () => {
    const response = await POST(buildRequest({ idempotencyKey: "idem_1", body: "not json" }), ctx());
    expect(response.status).toBe(400);
  });

  it("rejects a body missing patch/expectedVersion/originatingDraftId/originatingContextVersion with 400", async () => {
    const response = await POST(
      buildRequest({ idempotencyKey: "idem_1", body: { patch: { displayName: "New Name" } } }),
      ctx(),
    );
    expect(response.status).toBe(400);
    expect(executeCustomerUpdateGatewayMock).not.toHaveBeenCalled();
  });

  it("rejects a patch that is not an object with 400", async () => {
    const response = await POST(
      buildRequest({
        idempotencyKey: "idem_1",
        body: { patch: "not-an-object", expectedVersion: "v1", originatingDraftId: "d1", originatingContextVersion: 1 },
      }),
      ctx(),
    );
    expect(response.status).toBe(400);
  });

  it("takes customerId from the route param, not the request body", async () => {
    executeCustomerUpdateGatewayMock.mockResolvedValue({ actionName: "customer.update", executionId: "exec_1", status: "SUCCESS" });

    await POST(buildRequest({ idempotencyKey: "idem_1" }), ctx("cust_from_route"));

    expect(executeCustomerUpdateGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "cust_from_route" }),
    );
  });

  it("passes expectedVersion from the body straight through to the gateway", async () => {
    executeCustomerUpdateGatewayMock.mockResolvedValue({ actionName: "customer.update", executionId: "exec_1", status: "SUCCESS" });

    await POST(
      buildRequest({
        idempotencyKey: "idem_1",
        body: {
          patch: { displayName: "New Name" },
          expectedVersion: "2026-05-01T00:00:00.000Z",
          originatingDraftId: "draft_1",
          originatingContextVersion: 1,
        },
      }),
      ctx(),
    );

    expect(executeCustomerUpdateGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: "2026-05-01T00:00:00.000Z" }),
    );
  });

  it("uses the trusted server auth context, not any client-supplied identity", async () => {
    executeCustomerUpdateGatewayMock.mockResolvedValue({ actionName: "customer.update", executionId: "exec_1", status: "SUCCESS" });

    await POST(
      buildRequest({
        idempotencyKey: "idem_1",
        body: {
          patch: { displayName: "New Name", organizationId: "org_HACKED" },
          expectedVersion: "v1",
          originatingDraftId: "draft_1",
          originatingContextVersion: 1,
        },
      }),
      ctx(),
    );

    expect(executeCustomerUpdateGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({ authContext: FAKE_AUTH_CONTEXT }),
    );
  });

  it("uses the X-Correlation-Id header when present and non-empty", async () => {
    executeCustomerUpdateGatewayMock.mockResolvedValue({ actionName: "customer.update", executionId: "exec_1", status: "SUCCESS" });

    await POST(buildRequest({ idempotencyKey: "idem_1", correlationId: "corr_from_header" }), ctx());

    expect(executeCustomerUpdateGatewayMock).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: "corr_from_header" }),
    );
  });

  it("generates a correlationId when the header is absent", async () => {
    executeCustomerUpdateGatewayMock.mockResolvedValue({ actionName: "customer.update", executionId: "exec_1", status: "SUCCESS" });

    await POST(buildRequest({ idempotencyKey: "idem_1" }), ctx());

    const call = executeCustomerUpdateGatewayMock.mock.calls[0][0];
    expect(typeof call.correlationId).toBe("string");
    expect(call.correlationId.length).toBeGreaterThan(0);
  });

  it("returns the ExecutionResult wrapped as { execution } on success", async () => {
    const execution = { actionName: "customer.update", executionId: "exec_1", status: "SUCCESS" };
    executeCustomerUpdateGatewayMock.mockResolvedValue(execution);

    const response = await POST(buildRequest({ idempotencyKey: "idem_1" }), ctx());
    const json = (await response.json()) as { ok: true; data: { execution: unknown } };

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, data: { execution } });
  });

  it("maps a thrown AuthError to its own status", async () => {
    requireAuthContextFromCookiesMock.mockRejectedValue(new AuthError("no session", 401));

    const response = await POST(buildRequest({ idempotencyKey: "idem_1" }), ctx());
    expect(response.status).toBe(401);
  });

  it("maps PolicyDeniedError from the gateway to 403", async () => {
    executeCustomerUpdateGatewayMock.mockRejectedValue(new PolicyDeniedError("customer.update", "PERMISSION_DENIED"));

    const response = await POST(buildRequest({ idempotencyKey: "idem_1" }), ctx());
    expect(response.status).toBe(403);
  });

  it("maps ApprovalRequiredError from the gateway to 409", async () => {
    executeCustomerUpdateGatewayMock.mockRejectedValue(new ApprovalRequiredError("customer.update"));

    const response = await POST(buildRequest({ idempotencyKey: "idem_1" }), ctx());
    expect(response.status).toBe(409);
  });

  it("maps a wrapped CustomerVersionConflictError to 409 with a safe message", async () => {
    executeCustomerUpdateGatewayMock.mockRejectedValue(
      new ExecutionFailedError("customer.update", "exec_1", new CustomerVersionConflictError("cust_1")),
    );

    const response = await POST(buildRequest({ idempotencyKey: "idem_1" }), ctx());
    const json = (await response.json()) as { ok: false; error: { message: string } };

    expect(response.status).toBe(409);
    expect(json.error.message).not.toContain("cust_1");
  });

  it("maps an unrecognized thrown error to a safe generic 500", async () => {
    executeCustomerUpdateGatewayMock.mockRejectedValue(new Error("internal db explosion, host=10.0.0.5"));

    const response = await POST(buildRequest({ idempotencyKey: "idem_1" }), ctx());
    const json = (await response.json()) as { ok: false; error: { message: string } };

    expect(response.status).toBe(500);
    expect(json.error.message).toBe("Action execution failed.");
  });
});
