// Executive Brain Runtime — Faz 3B: Executive Module Registry

// ── Types ────────────────────────────────────────────────────────────────────

export type {
  ExecutiveBrainExecutionPriority,
  ExecutiveBrainExecutionPlan,
  ExecutiveBrainPolicy,
  ExecutiveBrainRuntimeInput,
  ExecutiveBrainRuntimeResult,
  ExecutiveBrainSessionState,
} from "./types";

export type {
  SchedulerModuleKey,
  ExecutiveBrainSnapshotStatus,
  ExecutiveBrainSnapshotUpdateMode,
  ExecutiveBrainSnapshot,
  SnapshotComposerInput,
  SnapshotComposerResult,
} from "./snapshot/snapshot.types";

export type {
  ExecutiveBrainSignalType,
  ExecutiveBrainSignalConfidence,
  ExecutiveBrainSignal,
} from "./signal-extractor/signal-extractor.types";

export type { PlannerInput } from "./planner/planner.types";

export type { SchedulerResult } from "./scheduler/scheduler.service";

export type {
  ExecutiveAdapterInput,
  ExecutiveAdapterModuleResult,
  ExecutiveAdapterResult,
} from "./executive-adapter/executive-adapter.types";

export type {
  ExecutiveModuleStatus,
  ExecutiveModuleExecutionMode,
  ExecutiveModuleDefinition,
  ExecutiveModuleRegistry,
} from "./module-registry/module-registry.types";

// ── Services ─────────────────────────────────────────────────────────────────

export { runExecutiveBrainRuntime } from "./runtime.service";
export { extractExecutiveBrainSignals } from "./signal-extractor/signal-extractor.service";
export { buildExecutiveExecutionPlan } from "./planner/planner.service";
export { scheduleExecutiveExecution } from "./scheduler/scheduler.service";
export { composeExecutiveBrainSnapshot } from "./snapshot/snapshot-composer.service";
export { readExecutiveBrainSnapshot } from "./snapshot/snapshot.reader";
export { writeExecutiveBrainSnapshot } from "./snapshot/snapshot.writer";
export { runExecutiveAdapter } from "./executive-adapter/executive-adapter.service";
export { DEFAULT_EXECUTIVE_MODULE_REGISTRY } from "./module-registry/module-registry.constants";
export {
  getExecutiveModuleDefinition,
  getActiveExecutiveModules,
  resolveExecutiveModuleDependencies,
  validateExecutiveModulePlan,
} from "./module-registry/module-registry.service";
