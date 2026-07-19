import { randomUUID } from "crypto";

import { assertSurfaceAction } from "./action-guard";
import { compareDraft, computeDirtyFields } from "./draft-diff";
import {
  ContextMismatchError,
  DraftAlreadyExistsError,
  DraftNotFoundError,
  EntityMismatchError,
  VersionMismatchError,
} from "./draft.errors";
import type {
  ActionRegistryLike,
  CreateDraftInput,
  DraftDiff,
  DraftFieldValues,
  DraftSnapshot,
  PageContextRuntimeLike,
  ResolvedDomainActionRequest,
} from "./draft.types";
import { actionRegistry } from "../registry";
import { pageContextRuntime } from "../context";
import type { PageContextSnapshot } from "../context/page-context.types";
import type { DraftLifecycleEnvelope, ExecutiveLifecycleSink } from "@/lib/executive-lifecycle";

export type DraftRuntimeOptions = {
  registry?: ActionRegistryLike;
  pageContext?: PageContextRuntimeLike;
  /** Test edilebilirlik için enjekte edilebilir id üretici; varsayılan crypto.randomUUID. */
  generateId?: () => string;
  /** Test edilebilirlik için enjekte edilebilir saat; varsayılan gerçek zaman. */
  clock?: () => Date;
  /** Read-only lifecycle adapter sink. It cannot influence draft authority. */
  lifecycleSink?: ExecutiveLifecycleSink;
};

/**
 * Executive Draft / Surface Action Runtime.
 *
 * Yalnızca geçici çalışma durumunu (draft) yönetir. Hiçbir zaman kalıcı
 * veri değiştirmez, hiçbir Domain Action çalıştırmaz, hiçbir handler
 * çağırmaz, hiçbir repository bilmez. Yalnızca Registry (actionClass
 * doğrulaması için) ve Page Context Runtime (argument-resolution ve
 * staleness kontrolü için) ile konuşur — başka hiçbir runtime bileşeniyle
 * iletişim kurmaz.
 *
 * commitDraft() yalnızca "hangi Domain Action çağrılmalı?" sorusunun
 * cevabını (ResolvedDomainActionRequest) üretir; hiçbir execution
 * başlatmaz, hiçbir ActionExecutionRequest oluşturmaz.
 */
export class DraftRuntime {
  private readonly registry: ActionRegistryLike;
  private readonly pageContext: PageContextRuntimeLike;
  private readonly generateId: () => string;
  private readonly clock: () => Date;
  private readonly lifecycleSink?: ExecutiveLifecycleSink;

  private readonly baselines = new Map<string, DraftSnapshot>();
  private readonly drafts = new Map<string, DraftSnapshot>();

  constructor(options: DraftRuntimeOptions = {}) {
    this.registry = options.registry ?? actionRegistry;
    this.pageContext = options.pageContext ?? pageContextRuntime;
    this.generateId = options.generateId ?? (() => randomUUID());
    this.clock = options.clock ?? (() => new Date());
    this.lifecycleSink = options.lifecycleSink;
  }

  createDraft(input: CreateDraftInput): DraftSnapshot {
    const draftId = input.draftId ?? this.generateId();

    if (this.drafts.has(draftId)) {
      throw new DraftAlreadyExistsError(draftId);
    }

    const context = this.pageContext.getCurrentContext();
    if (context === null) {
      throw new ContextMismatchError("createDraft");
    }

    if (context.entityType !== input.entityType || context.entityId !== input.entityId) {
      throw new EntityMismatchError(
        "createDraft",
        input.entityType,
        input.entityId,
        context.entityType,
        context.entityId,
      );
    }

    const now = this.clock().toISOString();

    const snapshot: DraftSnapshot = Object.freeze({
      draftId,
      entityType: input.entityType,
      entityId: input.entityId,
      baseVersion: context.version,
      fieldValues: Object.freeze({ ...input.fieldValues }),
      dirtyFields: Object.freeze([]),
      valid: true,
      createdAt: now,
      updatedAt: now,
    });

    this.baselines.set(draftId, snapshot);
    this.drafts.set(draftId, snapshot);
    this.emit(snapshot, "created", "succeeded", "Taslak oluşturuldu");
    return snapshot;
  }

  updateField(draftId: string, fieldName: string, value: unknown): DraftSnapshot {
    assertSurfaceAction(this.registry, "draft.set_field");
    const draft = this.requireDraft(draftId);
    this.assertContextAligned(draft, "updateField");

    return this.applyFieldValues(draftId, draft, { ...draft.fieldValues, [fieldName]: value });
  }

  clearField(draftId: string, fieldName: string): DraftSnapshot {
    assertSurfaceAction(this.registry, "draft.clear_field");
    const draft = this.requireDraft(draftId);
    this.assertContextAligned(draft, "clearField");

    return this.applyFieldValues(draftId, draft, { ...draft.fieldValues, [fieldName]: null });
  }

  revertField(draftId: string, fieldName: string): DraftSnapshot {
    assertSurfaceAction(this.registry, "draft.revert_field");
    const draft = this.requireDraft(draftId);
    this.assertContextAligned(draft, "revertField");

    const baseline = this.requireBaseline(draftId);
    const fieldValues = { ...draft.fieldValues };

    if (fieldName in baseline.fieldValues) {
      fieldValues[fieldName] = baseline.fieldValues[fieldName];
    } else {
      delete fieldValues[fieldName];
    }

    return this.applyFieldValues(draftId, draft, fieldValues);
  }

  discardDraft(draftId: string): void {
    assertSurfaceAction(this.registry, "draft.discard");
    const draft = this.requireDraft(draftId);

    this.drafts.delete(draftId);
    this.baselines.delete(draftId);
    this.emit(draft, "discarded", "cancelled", "Taslak iptal edildi");
  }

  commitDraft(draftId: string): ResolvedDomainActionRequest {
    assertSurfaceAction(this.registry, "draft.commit");
    const draft = this.requireDraft(draftId);
    try {
      const context = this.assertContextAligned(draft, "commitDraft");
      const baseline = this.requireBaseline(draftId);
      const diff = compareDraft(baseline, draft);
      const resolved = Object.freeze({
        actionName: `${draft.entityType}.update`,
        entityRef: Object.freeze({ entityType: draft.entityType, entityId: draft.entityId }),
        patch: Object.freeze({ ...diff.changedFields }),
        originatingDraftId: draft.draftId,
        originatingContextVersion: context.version,
      });
      this.emit(draft, "committed", "succeeded", "Taslak işleme hazırlandı");
      return resolved;
    } catch (error) {
      this.emit(draft, "failed", "failed", "Taslak işleme hazırlanamadı", error);
      throw error;
    }
  }

  captureDraft(draftId: string): DraftSnapshot {
    return this.requireDraft(draftId);
  }

  compareDraft(a: DraftSnapshot, b: DraftSnapshot): DraftDiff {
    return compareDraft(a, b);
  }

  private requireDraft(draftId: string): DraftSnapshot {
    const draft = this.drafts.get(draftId);

    if (!draft) {
      throw new DraftNotFoundError(draftId);
    }

    return draft;
  }

  private requireBaseline(draftId: string): DraftSnapshot {
    const baseline = this.baselines.get(draftId);

    if (!baseline) {
      throw new DraftNotFoundError(draftId);
    }

    return baseline;
  }

  private assertContextAligned(draft: DraftSnapshot, operation: string): PageContextSnapshot {
    const context = this.pageContext.getCurrentContext();

    if (context === null) {
      throw new ContextMismatchError(operation);
    }

    if (context.entityType !== draft.entityType || context.entityId !== draft.entityId) {
      throw new EntityMismatchError(
        operation,
        draft.entityType,
        draft.entityId,
        context.entityType,
        context.entityId,
      );
    }

    if (this.pageContext.isStale(draft.baseVersion)) {
      throw new VersionMismatchError(operation, draft.baseVersion);
    }

    return context;
  }

  private applyFieldValues(draftId: string, draft: DraftSnapshot, fieldValues: DraftFieldValues): DraftSnapshot {
    const baseline = this.requireBaseline(draftId);
    const dirtyFields = computeDirtyFields(baseline.fieldValues, fieldValues);

    const snapshot: DraftSnapshot = Object.freeze({
      ...draft,
      fieldValues: Object.freeze({ ...fieldValues }),
      dirtyFields: Object.freeze(dirtyFields),
      updatedAt: this.clock().toISOString(),
    });

    this.drafts.set(draftId, snapshot);
    this.emit(snapshot, "updated", "succeeded", "Taslak güncellendi");
    return snapshot;
  }

  private emit(
    draft: DraftSnapshot,
    phase: DraftLifecycleEnvelope["phase"],
    status: DraftLifecycleEnvelope["status"],
    summary: string,
    cause?: unknown,
  ): void {
    if (!this.lifecycleSink) return;
    const context = this.pageContext.getCurrentContext();
    this.lifecycleSink(Object.freeze({
      envelopeId: `draft:${draft.draftId}:${phase}:${draft.updatedAt}`,
      source: "draft",
      phase,
      status,
      timestamp: this.clock().getTime(),
      correlationId: draft.draftId,
      sessionId: draft.draftId,
      module: context?.module,
      entityType: draft.entityType,
      entityId: draft.entityId,
      target: { executiveTargetId: `${draft.entityType}:${draft.entityId}`, entityType: draft.entityType, entityId: draft.entityId },
      summary,
      outcome: phase === "discarded" ? "cancelled" : phase === "failed" ? "failed" : undefined,
      recoverability: phase === "failed" ? "retryable" : undefined,
      error: phase === "failed" ? {
        code: cause instanceof Error ? cause.name : "DRAFT_COMMIT_FAILED",
        message: cause instanceof Error ? cause.message : summary,
        retryable: true,
      } : undefined,
      draft: { draftId: draft.draftId, draftType: draft.entityType, changedFields: draft.dirtyFields },
    }));
  }
}

export function createDraftRuntime(options?: DraftRuntimeOptions): DraftRuntime {
  return new DraftRuntime(options);
}
