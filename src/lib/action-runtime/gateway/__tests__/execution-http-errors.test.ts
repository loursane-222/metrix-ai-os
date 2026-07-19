import { describe, expect, it, vi } from "vitest";

// execution-http-errors.ts imports domains/customers for CustomerNotFoundError
// etc., which transitively imports customer.service -> the real Prisma client
// (throws at import time without DATABASE_URL). No test here touches Prisma.
vi.mock("@/lib/core/shared/prisma", () => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({})),
  },
}));

import { ApiValidationError } from "@/lib/api/validation";
import { AuthError } from "@/lib/auth/shared/auth.errors";

import {
  ApprovalRequiredError,
  ExecutionFailedError,
  ExecutionRejectedError,
  HandlerNotFoundError,
  IdempotencyConflictError,
  InputValidationError,
  PolicyDeniedError,
  RegistryLookupFailedError,
} from "../../execution";
import {
  CustomerNotFoundError,
  CustomerUpdateInputError,
  CustomerVersionConflictError,
} from "../../domains/customers";
import { mapExecutionErrorToHttpResponse } from "../execution-http-errors";

async function statusAndBody(response: Response) {
  return { status: response.status, body: (await response.json()) as { ok: false; error: { message: string } } };
}

describe("mapExecutionErrorToHttpResponse", () => {
  it("maps ApiValidationError to its own status (400 by default)", async () => {
    const { status } = await statusAndBody(mapExecutionErrorToHttpResponse(new ApiValidationError("bad body")));
    expect(status).toBe(400);
  });

  it("maps AuthError to its own status", async () => {
    const { status } = await statusAndBody(mapExecutionErrorToHttpResponse(new AuthError("no session", 401)));
    expect(status).toBe(401);
  });

  it("maps InputValidationError to 400", async () => {
    const { status } = await statusAndBody(
      mapExecutionErrorToHttpResponse(new InputValidationError("customer.update", ["patch is required."])),
    );
    expect(status).toBe(400);
  });

  it("maps PolicyDeniedError to 403", async () => {
    const { status } = await statusAndBody(
      mapExecutionErrorToHttpResponse(new PolicyDeniedError("customer.update", "PERMISSION_DENIED")),
    );
    expect(status).toBe(403);
  });

  it("maps ApprovalRequiredError to 409", async () => {
    const { status } = await statusAndBody(mapExecutionErrorToHttpResponse(new ApprovalRequiredError("customer.update")));
    expect(status).toBe(409);
  });

  it("maps IdempotencyConflictError to 409", async () => {
    const { status } = await statusAndBody(mapExecutionErrorToHttpResponse(new IdempotencyConflictError("idem_1")));
    expect(status).toBe(409);
  });

  it("distinguishes in-progress from an idempotency input conflict", async () => {
    const inProgress = await statusAndBody(
      mapExecutionErrorToHttpResponse(new IdempotencyConflictError("idem_1", "IN_PROGRESS")),
    );
    const mismatch = await statusAndBody(
      mapExecutionErrorToHttpResponse(new IdempotencyConflictError("idem_1", "INPUT_MISMATCH")),
    );
    expect(inProgress.body.error.message).toContain("zaten devam ediyor");
    expect(mismatch.body.error.message).toContain("farkli bir icerikle");
  });

  it("maps ExecutionRejectedError to 400", async () => {
    const { status } = await statusAndBody(
      mapExecutionErrorToHttpResponse(new ExecutionRejectedError("customer.update", "not a DOMAIN action")),
    );
    expect(status).toBe(400);
  });

  it("maps RegistryLookupFailedError to a safe 500 without leaking internals", async () => {
    const { status, body } = await statusAndBody(
      mapExecutionErrorToHttpResponse(new RegistryLookupFailedError("customer.update")),
    );
    expect(status).toBe(500);
    expect(body.error.message).toBe("Action execution failed.");
  });

  it("maps HandlerNotFoundError to a safe 500 without leaking internals", async () => {
    const { status, body } = await statusAndBody(
      mapExecutionErrorToHttpResponse(new HandlerNotFoundError("customer.update")),
    );
    expect(status).toBe(500);
    expect(body.error.message).toBe("Action execution failed.");
  });

  describe("ExecutionFailedError cause unwrapping", () => {
    it("maps a wrapped CustomerNotFoundError to 404", async () => {
      const cause = new CustomerNotFoundError("cust_1");
      const { status, body } = await statusAndBody(
        mapExecutionErrorToHttpResponse(new ExecutionFailedError("customer.update", "exec_1", cause)),
      );
      expect(status).toBe(404);
      expect(body.error.message).not.toContain("cust_1");
    });

    it("maps a wrapped CustomerVersionConflictError to 409 with a safe user-facing message", async () => {
      const cause = new CustomerVersionConflictError("cust_1");
      const { status, body } = await statusAndBody(
        mapExecutionErrorToHttpResponse(new ExecutionFailedError("customer.update", "exec_1", cause)),
      );
      expect(status).toBe(409);
      expect(body.error.message).toContain("Guncel kaydi yeniden yukleyip");
    });

    it("maps a wrapped CustomerUpdateInputError to 400", async () => {
      const cause = new CustomerUpdateInputError(["patch.status is invalid."]);
      const { status } = await statusAndBody(
        mapExecutionErrorToHttpResponse(new ExecutionFailedError("customer.update", "exec_1", cause)),
      );
      expect(status).toBe(400);
    });

    it("falls back to a safe generic 500 for an unknown cause, never leaking the raw cause message", async () => {
      const cause = new Error("Prisma: connection to organization_secrets_table failed, tenant=acme");
      const { status, body } = await statusAndBody(
        mapExecutionErrorToHttpResponse(new ExecutionFailedError("customer.update", "exec_1", cause)),
      );
      expect(status).toBe(500);
      expect(body.error.message).toBe("Action execution failed.");
      expect(body.error.message).not.toContain("organization_secrets_table");
    });
  });

  it("falls back to a safe generic 500 for a totally unrecognized error", async () => {
    const { status, body } = await statusAndBody(mapExecutionErrorToHttpResponse("not even an Error"));
    expect(status).toBe(500);
    expect(body.error.message).toBe("Action execution failed.");
  });
});
