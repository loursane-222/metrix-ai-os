import { createInMemoryAuditStore } from "./audit-store";

export * from "./audit.errors";
export * from "./audit.types";
export { createInMemoryAuditStore };
export type { InMemoryAuditStoreOptions } from "./audit-store";

/**
 * Uygulama genelinde paylaşılabilir singleton. React/Next.js/Prisma'ya
 * hiçbir bağımlılık yoktur.
 */
export const auditStore = createInMemoryAuditStore();
