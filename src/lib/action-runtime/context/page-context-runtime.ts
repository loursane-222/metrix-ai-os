import { collectPageContextInputValidationErrors } from "./page-context-validation";
import { ContextAlreadyExistsError, InvalidPageContextInputError, NoActiveContextError } from "./page-context.errors";
import type { PageContextInput, PageContextSnapshot, PageContextUpdate } from "./page-context.types";

export type PageContextRuntimeOptions = {
  /** Test edilebilirlik için enjekte edilebilir saat; varsayılan gerçek zaman. */
  clock?: () => Date;
};

/**
 * Executive Page Context Runtime.
 *
 * Yalnızca kullanıcının mevcut çalışma bağlamını immutable snapshot'lar
 * olarak tutar — argument-resolution kaynağıdır, otorite değildir.
 * Hiçbir action çalıştırmaz, hiçbir permission kararı vermez, hiçbir
 * repository sorgulamaz, bir entity'nin gerçekten var olduğunu garanti
 * etmez. Bu doğrulamalar Execution Runtime'ın sorumluluğudur.
 *
 * Framework bağımsızdır: React/Next.js'e hiçbir referans içermez.
 */
export class PageContextRuntime {
  private readonly clock: () => Date;
  private current: PageContextSnapshot | null = null;
  private versionCounter = 0;

  constructor(options: PageContextRuntimeOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
  }

  createContext(input: PageContextInput): PageContextSnapshot {
    if (this.current !== null) {
      throw new ContextAlreadyExistsError();
    }

    return this.commit(input);
  }

  replaceContext(input: PageContextInput): PageContextSnapshot {
    if (this.current === null) {
      throw new NoActiveContextError("replaceContext");
    }

    return this.commit(input);
  }

  updateContext(update: PageContextUpdate): PageContextSnapshot {
    if (this.current === null) {
      throw new NoActiveContextError("updateContext");
    }

    const current = this.current;
    const merged: PageContextInput = {
      module: update.module ?? current.module,
      surface: update.surface ?? current.surface,
      route: update.route ?? current.route,
      entityType: update.entityType !== undefined ? update.entityType : current.entityType,
      entityId: update.entityId !== undefined ? update.entityId : current.entityId,
      activeTab: update.activeTab !== undefined ? update.activeTab : current.activeTab,
      activeForm: update.activeForm !== undefined ? update.activeForm : current.activeForm,
      activeDraftId: update.activeDraftId !== undefined ? update.activeDraftId : current.activeDraftId,
      selection: update.selection !== undefined ? update.selection : current.selection,
    };

    return this.commit(merged);
  }

  clearContext(): void {
    this.current = null;
  }

  getCurrentContext(): PageContextSnapshot | null {
    return this.current;
  }

  captureSnapshot(): PageContextSnapshot {
    if (this.current === null) {
      throw new NoActiveContextError("captureSnapshot");
    }

    return this.current;
  }

  compareVersion(a: PageContextSnapshot, b: PageContextSnapshot): number {
    return a.version - b.version;
  }

  isStale(reference: PageContextSnapshot | number): boolean {
    if (this.current === null) {
      return true;
    }

    const referenceVersion = typeof reference === "number" ? reference : reference.version;
    return referenceVersion !== this.current.version;
  }

  private commit(input: PageContextInput): PageContextSnapshot {
    const reasons = collectPageContextInputValidationErrors(input);
    if (reasons.length > 0) {
      throw new InvalidPageContextInputError(reasons);
    }

    this.versionCounter += 1;

    const snapshot: PageContextSnapshot = Object.freeze({
      module: input.module,
      surface: input.surface,
      route: input.route,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      activeTab: input.activeTab ?? null,
      activeForm: input.activeForm ?? null,
      activeDraftId: input.activeDraftId ?? null,
      selection: Object.freeze([...(input.selection ?? [])]),
      version: this.versionCounter,
      capturedAt: this.clock().toISOString(),
    });

    this.current = snapshot;
    return snapshot;
  }
}

export function createPageContextRuntime(options?: PageContextRuntimeOptions): PageContextRuntime {
  return new PageContextRuntime(options);
}
