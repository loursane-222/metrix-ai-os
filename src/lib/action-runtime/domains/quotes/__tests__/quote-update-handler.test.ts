import { describe, expect, it, vi } from "vitest";

const { updateQuoteWithVersionGuardMock } = vi.hoisted(() => ({ updateQuoteWithVersionGuardMock: vi.fn() }));
vi.mock("@/lib/core/quotes/quote.service", () => ({ updateQuoteWithVersionGuard: updateQuoteWithVersionGuardMock }));

import { quoteUpdateHandler } from "../quote-update-handler";
import type { ActionExecutionEnvelope } from "../../../execution";

function buildEnvelope(patch: Record<string, unknown>): ActionExecutionEnvelope {
  return {
    executionId: "exec_1",
    actionName: "quote.update",
    input: { quoteId: "q1", expectedVersion: "2026-01-01T00:00:00.000Z", patch },
    executionContext: { actorId: "actor_1", organizationId: "org_1", role: "OWNER", permissions: ["quotes.write"], sessionRef: "s1", issuedAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-01T01:00:00.000Z" },
    idempotencyKey: "idem_1",
    startedAt: "2026-01-01T00:00:00.000Z",
  } as ActionExecutionEnvelope;
}

describe("quoteUpdateHandler compensationSnapshot", () => {
  // Regression: quote.update is a self-compensating action (see
  // compensation.ts) — a failed later step in the same orchestration
  // reverses it by replaying quote.update with this exact snapshot.
  it("builds a compensationSnapshot that reverse-patches only the changed commercial fields", async () => {
    updateQuoteWithVersionGuardMock.mockResolvedValue({
      outcome: "UPDATED",
      quote: { updatedAt: new Date("2026-01-02T00:00:00.000Z") },
      previous: { customerNote: "Eski not" },
    });

    const result = await quoteUpdateHandler(buildEnvelope({ customerNote: "Yeni not" }));

    expect(result.compensationSnapshot).toEqual({
      quoteId: "q1",
      expectedVersion: "2026-01-02T00:00:00.000Z",
      patch: { customerNote: "Eski not" },
    });
  });

  it("does not include items in the reverse-patch (narrower-than-full scope)", async () => {
    updateQuoteWithVersionGuardMock.mockResolvedValue({
      outcome: "UPDATED",
      quote: { updatedAt: new Date("2026-01-02T00:00:00.000Z") },
      previous: {},
    });

    const result = await quoteUpdateHandler(buildEnvelope({ items: [{ name: "X", quantity: 1, unitPriceCents: 100 }] }));

    expect(result.compensationSnapshot).toBeUndefined();
  });

  it("omits compensationSnapshot when the update was NO_CHANGE", async () => {
    updateQuoteWithVersionGuardMock.mockResolvedValue({
      outcome: "NO_CHANGE",
      quote: { updatedAt: new Date("2026-01-01T00:00:00.000Z") },
    });

    const result = await quoteUpdateHandler(buildEnvelope({ customerNote: "x" }));

    expect(result.compensationSnapshot).toBeUndefined();
  });
});
