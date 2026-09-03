import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireAuthContextFromCookiesMock, executeCanonicalOperationMock } = vi.hoisted(() => ({
  requireAuthContextFromCookiesMock: vi.fn(),
  executeCanonicalOperationMock: vi.fn(),
}));

vi.mock("@/lib/auth/guards/api-auth-guard", () => ({
  requireAuthContextFromCookies: requireAuthContextFromCookiesMock,
}));

vi.mock("@/lib/canonical-operation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/canonical-operation")>();
  return { ...actual, executeCanonicalOperation: executeCanonicalOperationMock };
});

// mapExecutionErrorToHttpResponse (imported by route.ts) pulls in
// domains/customers -> customer.service -> the real Prisma client, which
// throws at import time without DATABASE_URL. No test here touches Prisma.
vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})),
  },
}));

import { AuthError } from "@/lib/auth/shared/auth.errors";
import type { CanonicalOperationResultV1 } from "@/lib/canonical-operation";

import { POST } from "../route";

const FAKE_AUTH_CONTEXT = {
  user: { id: "user_1" },
  organization: { id: "org_1" },
  membership: { role: "MANAGER" },
  session: { id: "session_1", createdAt: new Date("2026-01-01T00:00:00.000Z"), expiresAt: new Date("2026-01-01T01:00:00.000Z") },
};

function executedResult(overrides: Partial<CanonicalOperationResultV1> = {}): CanonicalOperationResultV1 {
  return {
    operationId: "idem_1",
    correlationId: "corr_1",
    capability: "customer.update",
    status: "EXECUTED",
    entityResolution: "RESOLVED",
    mutationPerformed: true,
    readback: { status: "PASSED", source: "CONNECTOR_READBACK" },
    nativeExecutionId: "exec_1",
    nativeOperationId: "native_op_1",
    completedAt: "2026-01-01T00:00:01.000Z",
    ...overrides,
  };
}

function failedResult(overrides: Partial<CanonicalOperationResultV1>): CanonicalOperationResultV1 {
  return {
    operationId: "idem_1",
    correlationId: "corr_1",
    capability: "customer.update",
    status: "FAILED",
    entityResolution: "UNKNOWN",
    mutationPerformed: false,
    readback: { status: "NOT_APPLICABLE", source: "NONE" },
    completedAt: "2026-01-01T00:00:01.000Z",
    ...overrides,
  };
}

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
    executeCanonicalOperationMock.mockReset();
  });

  it("rejects a request with no Idempotency-Key header with 400", async () => {
    const response = await POST(buildRequest({ idempotencyKey: undefined }), ctx());
    expect(response.status).toBe(400);
    expect(executeCanonicalOperationMock).not.toHaveBeenCalled();
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
    expect(executeCanonicalOperationMock).not.toHaveBeenCalled();
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

  it("takes customerId from the route param, not the request body, and targets the customer.update capability", async () => {
    executeCanonicalOperationMock.mockResolvedValue(executedResult());

    await POST(buildRequest({ idempotencyKey: "idem_1" }), ctx("cust_from_route"));

    const operation = executeCanonicalOperationMock.mock.calls[0]![0];
    expect(operation.capability).toBe("customer.update");
    expect(operation.entity).toEqual({ entityType: "customer", entityId: "cust_from_route" });
    expect(operation.payload.customerId).toBe("cust_from_route");
  });

  it("passes expectedVersion from the body straight through to the operation payload", async () => {
    executeCanonicalOperationMock.mockResolvedValue(executedResult());

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

    const operation = executeCanonicalOperationMock.mock.calls[0]![0];
    expect(operation.payload.expectedVersion).toBe("2026-05-01T00:00:00.000Z");
  });

  it("uses the trusted server auth context, not any client-supplied identity", async () => {
    executeCanonicalOperationMock.mockResolvedValue(executedResult());

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

    const [operation, deps] = executeCanonicalOperationMock.mock.calls[0]!;
    expect(deps.authContext).toEqual(FAKE_AUTH_CONTEXT);
    expect(operation.organizationId).toBe("org_1");
    expect(operation.actorId).toBe("user_1");
  });

  it("uses the X-Correlation-Id header when present and non-empty", async () => {
    executeCanonicalOperationMock.mockResolvedValue(executedResult());

    await POST(buildRequest({ idempotencyKey: "idem_1", correlationId: "corr_from_header" }), ctx());

    const operation = executeCanonicalOperationMock.mock.calls[0]![0];
    expect(operation.correlationId).toBe("corr_from_header");
  });

  it("generates a correlationId when the header is absent", async () => {
    executeCanonicalOperationMock.mockResolvedValue(executedResult());

    await POST(buildRequest({ idempotencyKey: "idem_1" }), ctx());

    const operation = executeCanonicalOperationMock.mock.calls[0]![0];
    expect(typeof operation.correlationId).toBe("string");
    expect(operation.correlationId.length).toBeGreaterThan(0);
  });

  it("uses the Idempotency-Key header as the canonical operationId (idempotency key)", async () => {
    executeCanonicalOperationMock.mockResolvedValue(executedResult());

    await POST(buildRequest({ idempotencyKey: "idem_specific" }), ctx());

    const operation = executeCanonicalOperationMock.mock.calls[0]![0];
    expect(operation.operationId).toBe("idem_specific");
  });

  it("returns an EXECUTED CanonicalOperationResult wrapped as { execution } on success", async () => {
    executeCanonicalOperationMock.mockResolvedValue(executedResult({ mutationPerformed: true }));

    const response = await POST(buildRequest({ idempotencyKey: "idem_1" }), ctx());
    const json = (await response.json()) as { ok: true; data: { execution: { status: string; outcome: string } } };

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.execution.status).toBe("SUCCESS");
    expect(json.data.execution.outcome).toBe("SUCCEEDED");
  });

  it("reports NO_CHANGE outcome when the canonical result performed no mutation", async () => {
    executeCanonicalOperationMock.mockResolvedValue(executedResult({ mutationPerformed: false }));

    const response = await POST(buildRequest({ idempotencyKey: "idem_1" }), ctx());
    const json = (await response.json()) as { ok: true; data: { execution: { outcome: string } } };

    expect(json.data.execution.outcome).toBe("NO_CHANGE");
  });

  it("maps a thrown AuthError to its own status", async () => {
    requireAuthContextFromCookiesMock.mockRejectedValue(new AuthError("no session", 401));

    const response = await POST(buildRequest({ idempotencyKey: "idem_1" }), ctx());
    expect(response.status).toBe(401);
  });

  it("maps a FAILED/AUTHORIZATION_DENIED canonical result to 403, never a fabricated success", async () => {
    executeCanonicalOperationMock.mockResolvedValue(
      failedResult({ failureClassification: "AUTHORIZATION_DENIED", failureMessage: "Bu islemi gerceklestirme yetkiniz yok." }),
    );

    const response = await POST(buildRequest({ idempotencyKey: "idem_1" }), ctx());
    expect(response.status).toBe(403);
  });

  it("maps an APPROVAL_REQUIRED canonical result to 409", async () => {
    executeCanonicalOperationMock.mockResolvedValue(
      failedResult({ status: "APPROVAL_REQUIRED", failureClassification: "APPROVAL_REQUIRED" }),
    );

    const response = await POST(buildRequest({ idempotencyKey: "idem_1" }), ctx());
    expect(response.status).toBe(409);
  });

  it("maps a CONFLICT (version/readback mismatch) canonical result to 409 with a safe message", async () => {
    executeCanonicalOperationMock.mockResolvedValue(
      failedResult({ status: "CONFLICT", failureClassification: "VERSION_CONFLICT", failureMessage: "Kayit guncel degil, tekrar deneyin." }),
    );

    const response = await POST(buildRequest({ idempotencyKey: "idem_1" }), ctx());
    const json = (await response.json()) as { ok: false; error: { message: string } };

    expect(response.status).toBe(409);
    expect(json.error.message).not.toContain("cust_1");
  });

  it("maps a READBACK_MISMATCH conflict to 409 — success is never narrated when the re-read state doesn't match", async () => {
    executeCanonicalOperationMock.mockResolvedValue(
      failedResult({ status: "CONFLICT", failureClassification: "READBACK_MISMATCH", mutationPerformed: true, readback: { status: "MISMATCH", source: "CONNECTOR_READBACK" } }),
    );

    const response = await POST(buildRequest({ idempotencyKey: "idem_1" }), ctx());
    const json = (await response.json()) as { ok: false };

    expect(response.status).toBe(409);
    expect(json.ok).toBe(false);
  });

  it("maps an unrecognized thrown error to a safe generic 500", async () => {
    executeCanonicalOperationMock.mockRejectedValue(new Error("internal db explosion, host=10.0.0.5"));

    const response = await POST(buildRequest({ idempotencyKey: "idem_1" }), ctx());
    const json = (await response.json()) as { ok: false; error: { message: string } };

    expect(response.status).toBe(500);
    expect(json.error.message).toBe("Bu işlemi gerçekleştiremedim. Tekrar dener misiniz?");
  });
});
