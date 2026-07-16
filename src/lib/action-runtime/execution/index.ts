import { createExecutionRuntime, ExecutionRuntime } from "./execution-runtime";

export * from "./execution.errors";
export * from "./execution.types";
export { createInMemoryHandlerRegistry } from "./handler-registry";
export { createInMemoryIdempotencyStore } from "./idempotency-store";
export type { InMemoryIdempotencyStoreOptions } from "./idempotency-store";
export { validateInputAgainstSchema } from "./input-validator";
export { ExecutionRuntime, createExecutionRuntime };

/**
 * Runtime tek bir uygulama-genelinde paylaşılabilir singleton olarak da
 * sağlanır; varsayılan olarak gerçek actionRegistry ve policyEngine
 * singleton'larıyla, izole bir in-memory handler registry ve idempotency
 * store ile konuşur. Voice/Chat/Customers/React'e hiçbir bağımlılık
 * yoktur.
 */
export const executionRuntime = createExecutionRuntime();
