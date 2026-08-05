import { randomUUID } from "crypto";

import type { PrismaClient } from "@prisma/client";

import type {
  ExecutionResult,
  IdempotencyRecord,
  IdempotencyReservationOutcome,
  IdempotencyStore,
} from "./execution.types";

const DEFAULT_RESERVATION_TTL_MS = 15 * 60_000;
const DEFAULT_COMPLETED_TTL_MS = 24 * 60 * 60_000;

type DurableIdempotencyStoreOptions = {
  prisma: PrismaClient;
  clock?: () => Date;
  reservationTtlMs?: number;
  completedTtlMs?: number;
};

type LockedRecord = {
  key: string;
  scope: string;
  actionName: string;
  inputHash: string;
  status: "IN_PROGRESS" | "COMPLETED";
  ownerToken: string;
  resultJson: string | null;
  reservedAt: Date;
  completedAt: Date | null;
  expiresAt: Date;
};

export function createDurableIdempotencyStore(options: DurableIdempotencyStoreOptions): IdempotencyStore {
  if (!options.prisma) throw new Error("Durable idempotency requires a Prisma client.");
  const clock = options.clock ?? (() => new Date());
  const reservationTtlMs = options.reservationTtlMs ?? DEFAULT_RESERVATION_TTL_MS;
  const completedTtlMs = options.completedTtlMs ?? DEFAULT_COMPLETED_TTL_MS;
  if (reservationTtlMs <= 0 || completedTtlMs <= 0) throw new Error("Durable idempotency TTLs must be positive.");

  return {
    async reserve(key, actionName, inputHash, scope = "default", ownerToken = randomUUID()): Promise<IdempotencyReservationOutcome> {
      const now = clock();
      const reservationExpiresAt = new Date(now.getTime() + reservationTtlMs);

      return options.prisma.$transaction(async (tx) => {
        const inserted = await tx.$executeRaw`
          INSERT INTO "ActionIdempotencyRecord"
            ("id", "scope", "key", "actionName", "inputHash", "status", "ownerToken", "reservedAt", "expiresAt", "createdAt", "updatedAt")
          VALUES
            (${randomUUID()}, ${scope}, ${key}, ${actionName}, ${inputHash}, 'IN_PROGRESS', ${ownerToken}, ${now}, ${reservationExpiresAt}, ${now}, ${now})
          ON CONFLICT ("scope", "key") DO NOTHING
        `;
        if (inserted === 1) return { kind: "RESERVED" } as const;

        const rows = await tx.$queryRaw<LockedRecord[]>`
          SELECT "key", "scope", "actionName", "inputHash", "status", "ownerToken", "resultJson", "reservedAt", "completedAt", "expiresAt"
          FROM "ActionIdempotencyRecord"
          WHERE "scope" = ${scope} AND "key" = ${key}
          FOR UPDATE
        `;
        const existing = rows[0];
        if (!existing) throw new Error("Durable idempotency record disappeared during acquisition.");

        if (existing.expiresAt <= now) {
          await tx.$executeRaw`
            UPDATE "ActionIdempotencyRecord"
            SET "actionName" = ${actionName}, "inputHash" = ${inputHash}, "status" = 'IN_PROGRESS',
                "ownerToken" = ${ownerToken}, "resultJson" = NULL, "reservedAt" = ${now},
                "completedAt" = NULL, "expiresAt" = ${reservationExpiresAt}, "updatedAt" = ${now}
            WHERE "scope" = ${scope} AND "key" = ${key}
          `;
          return { kind: "RESERVED" } as const;
        }

        const sameRequest = existing.actionName === actionName && existing.inputHash === inputHash;
        if (existing.status === "COMPLETED") {
          if (sameRequest && existing.resultJson) {
            return { kind: "ALREADY_COMPLETED", result: parseExecutionResult(existing.resultJson) } as const;
          }
          return { kind: "CONFLICT", reasonCode: "INPUT_MISMATCH" } as const;
        }
        return { kind: "CONFLICT", reasonCode: sameRequest ? "IN_PROGRESS" : "INPUT_MISMATCH" } as const;
      });
    },

    async complete(key, result, scope = "default", ownerToken = ""): Promise<void> {
      const now = clock();
      const completedExpiresAt = new Date(now.getTime() + completedTtlMs);
      const resultJson = JSON.stringify(result);
      const updated = await options.prisma.$executeRaw`
        UPDATE "ActionIdempotencyRecord"
        SET "status" = 'COMPLETED', "resultJson" = ${resultJson}, "completedAt" = ${now},
            "expiresAt" = ${completedExpiresAt}, "updatedAt" = ${now}
        WHERE "scope" = ${scope} AND "key" = ${key} AND "ownerToken" = ${ownerToken} AND "status" = 'IN_PROGRESS'
      `;
      if (updated !== 1) throw new Error("Durable idempotency completion lost reservation ownership.");
    },

    async lookup(key, scope = "default"): Promise<IdempotencyRecord | undefined> {
      const now = clock();
      const rows = await options.prisma.$queryRaw<LockedRecord[]>`
        SELECT "key", "scope", "actionName", "inputHash", "status", "ownerToken", "resultJson", "reservedAt", "completedAt", "expiresAt"
        FROM "ActionIdempotencyRecord"
        WHERE "scope" = ${scope} AND "key" = ${key} AND "expiresAt" > ${now}
      `;
      const row = rows[0];
      if (!row) return undefined;
      return {
        key: row.key,
        scope: row.scope,
        actionName: row.actionName,
        inputHash: row.inputHash,
        status: row.status,
        result: row.resultJson ? parseExecutionResult(row.resultJson) : undefined,
        reservedAt: row.reservedAt.toISOString(),
        completedAt: row.completedAt?.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      };
    },
  };
}

function parseExecutionResult(value: string): ExecutionResult {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Durable idempotency completed result is invalid.");
  }
  return Object.freeze(parsed) as ExecutionResult;
}
