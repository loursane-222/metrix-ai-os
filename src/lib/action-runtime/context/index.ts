import { createPageContextRuntime, PageContextRuntime } from "./page-context-runtime";

export * from "./page-context.errors";
export * from "./page-context.types";
export { PageContextRuntime, createPageContextRuntime };

/**
 * Runtime tek bir uygulama-genelinde paylaşılabilir singleton olarak da
 * sağlanır. React/Next.js/Zustand'a hiçbir bağımlılık yoktur — bu yalnızca
 * framework bağımsız çekirdektir, henüz hiçbir UI entegrasyonu içermez.
 */
export const pageContextRuntime = createPageContextRuntime();
