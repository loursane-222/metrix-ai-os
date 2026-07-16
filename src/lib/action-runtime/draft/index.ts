import { createDraftRuntime, DraftRuntime } from "./draft-runtime";

export * from "./draft.errors";
export * from "./draft.types";
export { assertSurfaceAction } from "./action-guard";
export { compareDraft, computeDirtyFields } from "./draft-diff";
export { DraftRuntime, createDraftRuntime };

/**
 * Runtime tek bir uygulama-genelinde paylaşılabilir singleton olarak da
 * sağlanır; varsayılan olarak gerçek actionRegistry ve pageContextRuntime
 * singleton'larıyla konuşur. React/Next.js/Zustand/Prisma'ya hiçbir
 * bağımlılık yoktur — henüz hiçbir UI entegrasyonu içermez.
 */
export const draftRuntime = createDraftRuntime();
