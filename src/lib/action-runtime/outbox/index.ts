import { createInMemoryOutboxStore } from "./outbox-store";

export * from "./outbox.errors";
export * from "./outbox.types";
export { isValidOutboxTransition } from "./outbox-transitions";
export { createInMemoryOutboxStore };
export type { InMemoryOutboxStoreOptions } from "./outbox-store";

/**
 * Uygulama genelinde paylaşılabilir singleton. Gerçek worker, cron veya
 * external adapter bu fazda çalıştırılmaz.
 */
export const outboxStore = createInMemoryOutboxStore();
