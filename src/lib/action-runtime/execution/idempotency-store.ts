import type { ExecutionResult, IdempotencyRecord, IdempotencyStore } from "./execution.types";

export type InMemoryIdempotencyStoreOptions = {
  /** Test edilebilirlik için enjekte edilebilir saat; varsayılan gerçek zaman. */
  clock?: () => Date;
};

/**
 * Framework bağımsız soyutlama; production'da bu interface'i karşılayan
 * kalıcı bir store ile değiştirilebilir. Her çağrı izole bir Map yaratır
 * — global mutable test sızıntısı oluşturmaz.
 */
export function createInMemoryIdempotencyStore(options: InMemoryIdempotencyStoreOptions = {}): IdempotencyStore {
  const clock = options.clock ?? (() => new Date());
  const records = new Map<string, IdempotencyRecord>();

  function storageKey(key: string, scope = "default"): string {
    return JSON.stringify([scope, key]);
  }

  return {
    reserve(key, actionName, inputHash, scope = "default", ownerToken = "in-memory-owner") {
      const scopedKey = storageKey(key, scope);
      const existing = records.get(scopedKey);

      if (!existing) {
        records.set(scopedKey, {
          key,
          scope,
          actionName,
          inputHash,
          status: "IN_PROGRESS",
          ownerToken,
          reservedAt: clock().toISOString(),
          expiresAt: new Date(clock().getTime() + 15 * 60_000).toISOString(),
        });
        return { kind: "RESERVED" };
      }

      const sameRequest = existing.actionName === actionName && existing.inputHash === inputHash;

      if (existing.status === "COMPLETED") {
        if (sameRequest && existing.result) {
          return { kind: "ALREADY_COMPLETED", result: existing.result };
        }
        return { kind: "CONFLICT", reasonCode: "INPUT_MISMATCH" };
      }

      return { kind: "CONFLICT", reasonCode: sameRequest ? "IN_PROGRESS" : "INPUT_MISMATCH" };
    },
    complete(key, result: ExecutionResult, scope = "default", ownerToken = "in-memory-owner") {
      const scopedKey = storageKey(key, scope);
      const existing = records.get(scopedKey);

      if (!existing) {
        return;
      }
      if (existing.ownerToken !== ownerToken) throw new Error("In-memory idempotency completion lost reservation ownership.");

      records.set(scopedKey, {
        ...existing,
        status: "COMPLETED",
        result,
        completedAt: clock().toISOString(),
        expiresAt: new Date(clock().getTime() + 24 * 60 * 60_000).toISOString(),
      });
    },
    lookup(key, scope = "default") {
      return records.get(storageKey(key, scope));
    },
  };
}
