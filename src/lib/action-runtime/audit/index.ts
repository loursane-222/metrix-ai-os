import { createInMemoryAuditStore, createPrismaAuditStore } from "./audit-store";

export * from "./audit.errors";
export * from "./audit.types";
export { createInMemoryAuditStore, createPrismaAuditStore };
export type { InMemoryAuditStoreOptions } from "./audit-store";

/**
 * Uygulama genelinde paylaşılabilir singleton. Test'te in-memory, aksi
 * halde Prisma-backed — approvalStore ile aynı desen (bkz.
 * action-runtime/policy/index.ts). In-memory bir Map serverless cold
 * start'lar arasında hayatta kalmadığı için production'da audit trail'i
 * sessizce sıfırlıyordu; artık gerçek bir tabloya yazıyor.
 */
export const auditStore = process.env.NODE_ENV === "test"
  ? createInMemoryAuditStore()
  : createPrismaAuditStore(async () => (await import("@/lib/core/shared/prisma")).prisma);
