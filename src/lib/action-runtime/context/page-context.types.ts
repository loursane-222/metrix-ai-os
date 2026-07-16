import type { ActionDefinition } from "../registry/action-registry.types";

/**
 * Page Context'in module alanı, Registry'deki ownerModule ile aynı tip
 * evrenini paylaşır. Bu yalnızca bir type-level bağdır — hiçbir runtime
 * import veya çağrı Registry'ye yapılmaz.
 */
export type ModuleName = ActionDefinition["ownerModule"];

export type PageContextSelection = readonly string[];

/**
 * Immutable anlık görüntü. Yalnızca "şu an neredeyiz" bilgisini taşır;
 * bir otorite değildir, bir permission kaynağı değildir, bir entity'nin
 * gerçekten var olduğunu garanti etmez. availableActions kasıtlı olarak
 * burada yoktur — kullanılabilir eylemler çalışma zamanında Registry +
 * Policy + actor permissions + entity state + organization policy'den
 * hesaplanır, burada saklanmaz.
 */
export interface PageContextSnapshot {
  readonly module: ModuleName;
  readonly surface: string;
  readonly route: string;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly activeTab: string | null;
  readonly activeForm: string | null;
  readonly activeDraftId: string | null;
  readonly selection: PageContextSelection;
  readonly version: number;
  readonly capturedAt: string;
}

export type PageContextInput = {
  module: ModuleName;
  surface: string;
  route: string;
  entityType?: string | null;
  entityId?: string | null;
  activeTab?: string | null;
  activeForm?: string | null;
  activeDraftId?: string | null;
  selection?: PageContextSelection;
};

/**
 * updateContext() için: alan verilmemişse (undefined) mevcut değer korunur;
 * açıkça null verilmişse alan temizlenir. Bu ayrım semantik olarak önemlidir.
 */
export type PageContextUpdate = Partial<PageContextInput>;
