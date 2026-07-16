import type { DraftDiff, DraftFieldValues, DraftSnapshot } from "./draft.types";

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function computeDirtyFields(baseline: DraftFieldValues, current: DraftFieldValues): string[] {
  const keys = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  const dirty: string[] = [];

  for (const key of keys) {
    if (!valuesEqual(baseline[key], current[key])) {
      dirty.push(key);
    }
  }

  return dirty.sort();
}

/**
 * DraftSnapshot -> DraftDiff dönüşümü. İki snapshot'ın fieldValues'ları
 * arasındaki farkı, yalnızca değişen alanları içeren bir patch olarak
 * üretir. Kalıcı hiçbir işlem yapmaz, saf bir karşılaştırmadır.
 */
export function compareDraft(base: DraftSnapshot, current: DraftSnapshot): DraftDiff {
  const changedFields: DraftFieldValues = {};

  for (const field of computeDirtyFields(base.fieldValues, current.fieldValues)) {
    changedFields[field] = current.fieldValues[field] ?? null;
  }

  return {
    entityType: current.entityType,
    entityId: current.entityId,
    changedFields,
  };
}
