import { createInMemoryOperationStore } from "./operation-store";

export * from "./operation.errors";
export * from "./operation.types";
export { deriveFinalState, isValidCoreStatusTransition } from "./operation-transitions";
export { createInMemoryOperationStore };
export type { InMemoryOperationStoreOptions } from "./operation-store";

/**
 * Uygulama genelinde paylaşılabilir singleton. React/Next.js/Prisma'ya
 * hiçbir bağımlılık yoktur.
 */
export const operationStore = createInMemoryOperationStore();
