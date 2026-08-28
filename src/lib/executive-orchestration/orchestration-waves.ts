import { isStepReference } from "./executive-orchestration.types";
import type { OrchestrationStepArgs } from "./executive-orchestration.types";

// A "wave" is a set of step sequences with no dependency relationship
// between any of them — they can all execute concurrently. Waves
// themselves are ordered: everything a step in wave N depends on is
// guaranteed to be in an earlier wave (this is a property of how plans are
// built — see general-plan-resolver.ts's STEP_REFERENCE handling, which
// only ever lets a step reference an ALREADY-resolved earlier step, so the
// dependency graph is a DAG with edges strictly pointing backward; a cycle
// or forward reference cannot occur).
//
// Steps with zero $stepRef fields in their argsTemplate are mutually
// independent and land in wave 0 together. A step that references one
// wave-0 step lands in wave 1; a step referencing two steps from different
// waves lands one past the deeper of the two. This is a standard
// longest-path-from-source topological layering — it maximizes how much of
// the plan can run concurrently, since a step only ever waits on waves it
// actually depends on, never on unrelated sibling steps.
export function computeExecutionWaves(
  steps: readonly Readonly<{ sequence: number; input: OrchestrationStepArgs }>[],
): number[][] {
  const dependsOn = new Map<number, number[]>();
  for (const step of steps) {
    const deps: number[] = [];
    for (const value of Object.values(step.input)) {
      if (isStepReference(value)) deps.push(value.$stepRef + 1);
    }
    dependsOn.set(step.sequence, deps);
  }

  const depthCache = new Map<number, number>();
  function depthOf(sequence: number): number {
    const cached = depthCache.get(sequence);
    if (cached !== undefined) return cached;
    const deps = dependsOn.get(sequence) ?? [];
    const depth = deps.length === 0 ? 0 : 1 + Math.max(...deps.map(depthOf));
    depthCache.set(sequence, depth);
    return depth;
  }

  const waves: number[][] = [];
  for (const step of steps) {
    const depth = depthOf(step.sequence);
    (waves[depth] ??= []).push(step.sequence);
  }
  return waves;
}
