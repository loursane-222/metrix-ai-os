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

  return {
    reserve(key, actionName, inputHash) {
      const existing = records.get(key);

      if (!existing) {
        records.set(key, {
          key,
          actionName,
          inputHash,
          status: "IN_PROGRESS",
          reservedAt: clock().toISOString(),
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
    complete(key, result: ExecutionResult) {
      const existing = records.get(key);

      if (!existing) {
        return;
      }

      records.set(key, {
        ...existing,
        status: "COMPLETED",
        result,
        completedAt: clock().toISOString(),
      });
    },
    lookup(key) {
      return records.get(key);
    },
  };
}
