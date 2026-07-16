import type { ActionDefinition } from "../registry/action-registry.types";
import type { PageContextSnapshot } from "../context/page-context.types";

export type DraftFieldValues = Record<string, unknown>;

/**
 * Immutable anlık görüntü. Yalnızca geçici çalışma durumunu taşır —
 * hiçbir kalıcı veriyi temsil etmez. "valid" bu fazda her zaman true'dur;
 * gerçek alan-bazlı doğrulama Policy/Execution Runtime'ın sorumluluğudur.
 */
export interface DraftSnapshot {
  readonly draftId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly baseVersion: number;
  readonly fieldValues: DraftFieldValues;
  readonly dirtyFields: readonly string[];
  readonly valid: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type CreateDraftInput = {
  draftId?: string;
  entityType: string;
  entityId: string;
  fieldValues: DraftFieldValues;
};

/** DraftSnapshot -> DraftDiff: yalnızca değişen alanları taşıyan patch. */
export type DraftDiff = {
  entityType: string;
  entityId: string;
  changedFields: DraftFieldValues;
};

export type EntityRef = {
  entityType: string;
  entityId: string;
};

/**
 * commitDraft()'ın tek çıktısı. Hangi Domain Action'ın çağrılması
 * gerektiğinin cevabıdır — bir ActionExecutionRequest veya bir handler
 * çağrısı değildir. Execution Runtime bu isteği daha sonra kendi
 * validation/policy/approval/idempotency zincirinden geçirir.
 */
export interface ResolvedDomainActionRequest {
  readonly actionName: string;
  readonly entityRef: EntityRef;
  readonly patch: DraftFieldValues;
  readonly originatingDraftId: string;
  readonly originatingContextVersion: number;
}

/**
 * Draft Runtime'ın Registry'yle konuşmak için ihtiyaç duyduğu minimal
 * yüzey. Gerçek actionRegistry singleton'ı bu sözleşmeyi sağlar; testler
 * için enjekte edilebilir.
 */
export type ActionRegistryLike = {
  getActionDefinition(actionName: string): ActionDefinition;
};

/**
 * Draft Runtime'ın Page Context Runtime'la konuşmak için ihtiyaç duyduğu
 * minimal yüzey. Gerçek pageContextRuntime singleton'ı bu sözleşmeyi
 * sağlar; testler için enjekte edilebilir.
 */
export type PageContextRuntimeLike = {
  getCurrentContext(): PageContextSnapshot | null;
  isStale(reference: PageContextSnapshot | number): boolean;
};
