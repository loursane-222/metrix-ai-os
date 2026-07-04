import type { SchedulerModuleKey } from "../snapshot/snapshot.types";
import type { ExecutiveModuleDefinition } from "./module-registry.types";
import { DEFAULT_EXECUTIVE_MODULE_REGISTRY } from "./module-registry.constants";

/**
 * getExecutiveModuleDefinition — Verilen key için modül tanımını döner.
 * Bilinmeyen key için null döner; throw etmez.
 */
export function getExecutiveModuleDefinition(
  key: SchedulerModuleKey,
): ExecutiveModuleDefinition | null {
  return DEFAULT_EXECUTIVE_MODULE_REGISTRY.modules[key] ?? null;
}

/**
 * getActiveExecutiveModules — Status'u "disabled" olmayan tüm modülleri döner.
 */
export function getActiveExecutiveModules(): ExecutiveModuleDefinition[] {
  return Object.values(DEFAULT_EXECUTIVE_MODULE_REGISTRY.modules).filter(
    (m) => m.status !== "disabled",
  );
}

/**
 * resolveExecutiveModuleDependencies — Verilen modüllere eksik dependency'leri ekler.
 * DFS ile deterministik topological sıra üretir; döngülere karşı visited guard kullanır.
 * Throw etmez.
 */
export function resolveExecutiveModuleDependencies(
  modules: SchedulerModuleKey[],
): SchedulerModuleKey[] {
  const resolved: SchedulerModuleKey[] = [];
  const visited = new Set<SchedulerModuleKey>();

  function visit(key: SchedulerModuleKey): void {
    if (visited.has(key)) return;
    visited.add(key);
    const def = getExecutiveModuleDefinition(key);
    if (!def) return;
    for (const dep of def.dependencies) {
      visit(dep);
    }
    resolved.push(key);
  }

  for (const key of modules) {
    visit(key);
  }

  return resolved;
}

/**
 * validateExecutiveModulePlan — Plan içindeki her modülün dependency'lerinin
 * plan içinde mevcut olup olmadığını kontrol eder.
 * Throw etmez.
 */
export function validateExecutiveModulePlan(modules: SchedulerModuleKey[]): {
  valid: boolean;
  missingDependencies: Array<{
    module: SchedulerModuleKey;
    missing: SchedulerModuleKey[];
  }>;
} {
  const moduleSet = new Set(modules);
  const missingDependencies: Array<{
    module: SchedulerModuleKey;
    missing: SchedulerModuleKey[];
  }> = [];

  for (const key of modules) {
    const def = getExecutiveModuleDefinition(key);
    if (!def) continue;
    const missing = def.dependencies.filter((dep) => !moduleSet.has(dep));
    if (missing.length > 0) {
      missingDependencies.push({ module: key, missing });
    }
  }

  return {
    valid: missingDependencies.length === 0,
    missingDependencies,
  };
}
