import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { createDurableIdempotencyStore } from "../durable-idempotency-store";
import type { ExecutionResult } from "../execution.types";

const NOW = new Date("2026-08-05T10:00:00.000Z");

function result(): ExecutionResult {
  return {
    actionName: "customer.create",
    executionId: "exec-1",
    status: "SUCCESS",
    outcome: "SUCCEEDED",
    correlationId: "corr-1",
    operationId: "op-1",
    entityRef: { entityType: "customer", entityId: "customer-1" },
    startedAt: "2026-08-05T09:59:59.000Z",
    completedAt: "2026-08-05T10:00:00.000Z",
    metadata: { stagesCompleted: ["COMPLETION", "RESULT_BUILDING"] },
  };
}

function prismaDouble(input: { inserted?: number; rows?: unknown[]; completed?: number } = {}) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(input.inserted ?? 0),
    $queryRaw: vi.fn().mockResolvedValue(input.rows ?? []),
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    $executeRaw: vi.fn().mockResolvedValue(input.completed ?? 1),
    $queryRaw: vi.fn().mockResolvedValue(input.rows ?? []),
  } as unknown as PrismaClient;
  return { prisma, tx };
}

describe("createDurableIdempotencyStore", () => {
  it("fails fast without a durable Prisma authority", () => {
    expect(() => createDurableIdempotencyStore({ prisma: undefined as unknown as PrismaClient })).toThrow(
      "Durable idempotency requires a Prisma client.",
    );
  });

  it("atomically acquires a new durable reservation", async () => {
    const { prisma, tx } = prismaDouble({ inserted: 1 });
    const store = createDurableIdempotencyStore({ prisma, clock: () => NOW });
    await expect(store.reserve("key", "customer.create", "hash", "scope", "owner")).resolves.toEqual({ kind: "RESERVED" });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("returns the exact completed execution result without mutation", async () => {
    const completed = result();
    const { prisma } = prismaDouble({ rows: [{
      key: "key", scope: "scope", actionName: "customer.create", inputHash: "hash", status: "COMPLETED",
      ownerToken: "owner", resultJson: JSON.stringify(completed), reservedAt: NOW, completedAt: NOW,
      expiresAt: new Date(NOW.getTime() + 60_000),
    }] });
    const store = createDurableIdempotencyStore({ prisma, clock: () => NOW });
    await expect(store.lookup("key", "scope")).resolves.toMatchObject({ result: completed });
    await expect(store.reserve("key", "customer.create", "hash", "scope", "owner-2")).resolves.toEqual({
      kind: "ALREADY_COMPLETED",
      result: completed,
    });
  });

  it("reclaims an expired record under the acquisition transaction", async () => {
    const { prisma, tx } = prismaDouble({ rows: [{
      key: "key", scope: "scope", actionName: "customer.create", inputHash: "hash", status: "IN_PROGRESS",
      ownerToken: "old", resultJson: null, reservedAt: new Date(0), completedAt: null, expiresAt: new Date(1),
    }] });
    const store = createDurableIdempotencyStore({ prisma, clock: () => NOW });
    await expect(store.reserve("key", "customer.create", "hash", "scope", "new-owner")).resolves.toEqual({ kind: "RESERVED" });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("fails completion when reservation ownership was lost", async () => {
    const { prisma } = prismaDouble({ completed: 0 });
    const store = createDurableIdempotencyStore({ prisma, clock: () => NOW });
    await expect(store.complete("key", result(), "scope", "stale-owner")).rejects.toThrow(
      "Durable idempotency completion lost reservation ownership.",
    );
  });
});
