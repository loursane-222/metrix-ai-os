import { isRecord } from "@/lib/api/validation";
import { resolveTaskCreateConversationPlan } from "./tasks-client";
import { validateTaskCreatePlan, type TaskCreatePlan, type TaskCreatePlanFields } from "./task-create-conversation-plan";
import { extractObviousTaskCreatePlan, type TaskCreatePendingContext } from "./task-create-conversation-planner";
import { dispatchTaskNavigation, dispatchTaskNavigationCommand } from "./task-navigation-runtime";
import { dispatchTaskCreateCommand, getActiveTaskCreateSurfaceDescriptor } from "./task-create-surface-command-channel";
import type { ConversationExtensionSource } from "@/lib/conversation-extensions/conversation-extension-contract";
import { resolveCreatePlan, logCreatePlanResolution } from "@/lib/conversation-extensions/create-plan-resolution";

export type TaskCreateConversationResult = {
  handled: boolean;
  status: "EXECUTED" | "CLARIFICATION" | "FAILED" | "NOT_HANDLED";
  operation: "CREATE" | "QUERY" | "CANCEL" | "UNKNOWN";
  outcomeCode: string;
  fieldNames: string[];
  mutationPerformed: boolean;
  navigationRequested: boolean;
  navigationStatus: string;
  failureCode: string | null;
  createdTaskId?: string;
  // Canonical operation runtime identity for this turn — same contract as
  // customer-create-conversation-coordinator.ts's CustomerCreateConversationResult.
  operationId: string | null;
};

type CoordinatorState = {
  lifecycle: "IDLE" | "OPENING" | "COLLECTING" | "READY" | "SUBMITTING" | "SUCCEEDED" | "FAILED";
  fields: TaskCreatePlanFields;
  explicitCommitPending: boolean;
  activeSurfaceToken: string | null;
  lastError: string | null;
  // Canonical operation runtime identity — same contract as
  // customer-create-conversation-state.ts's operationId: minted once on
  // IDLE -> OPENING, reused across every turn of the same pending
  // operation, cleared on reset(). Carried as navigation correlationId and
  // into the surface-command-channel descriptor.
  operationId: string | null;
};

const emptyState = (): CoordinatorState => ({ lifecycle: "IDLE", fields: {}, explicitCommitPending: false, activeSurfaceToken: null, lastError: null, operationId: null });

export class TaskCreateConversationStateStore {
  private state: CoordinatorState = emptyState();
  get() { return this.state; }
  patch(next: Partial<CoordinatorState>) { this.state = { ...this.state, ...next }; }
  reset() { this.state = emptyState(); }
}

type Planner = (utterance: string, pendingContext: TaskCreatePendingContext) => Promise<TaskCreatePlan>;

async function productionPlanner(utterance: string, pendingContext: TaskCreatePendingContext): Promise<TaskCreatePlan> {
  const response = await resolveTaskCreateConversationPlan({ utterance, pendingContext });
  if (!response.ok || !isRecord(response.data)) throw new Error("PLANNER_FAILED");
  const plan = validateTaskCreatePlan(response.data.plan);
  if (!plan) throw new Error("INVALID_PLAN");
  return plan;
}

export class TaskCreateConversationCoordinator {
  readonly store: TaskCreateConversationStateStore;
  constructor(private deps: { planner: Planner } = { planner: productionPlanner }, store = new TaskCreateConversationStateStore()) {
    this.store = store;
  }
  dispose() {}

  async execute(utterance: string, source: ConversationExtensionSource = "written"): Promise<TaskCreateConversationResult> {
    const result = await this.executeTurn(utterance, source);
    // Attached once here (mirrors customer-create-conversation-coordinator.ts)
    // so every return path in executeTurn is covered without threading
    // operationId through each individual return site.
    return { ...result, operationId: this.store.get().operationId };
  }

  private async executeTurn(utterance: string, source: ConversationExtensionSource): Promise<TaskCreateConversationResult> {
    const state = this.store.get();
    const pendingContext: TaskCreatePendingContext = ["OPENING", "COLLECTING", "READY"].includes(state.lifecycle)
      ? { lifecycle: state.lifecycle as NonNullable<TaskCreatePendingContext>["lifecycle"], fields: state.fields }
      : null;
    // Canonical operation identity — same reuse/mint rule as customer-create's.
    const operationId = pendingContext && state.operationId ? state.operationId : crypto.randomUUID();

    const resolution = await resolveCreatePlan<TaskCreatePlan>({
      callPlanner: () => this.deps.planner(utterance, pendingContext),
      deterministicFallback: () => extractObviousTaskCreatePlan(utterance, pendingContext),
      countReliableFields: (candidate) => candidate.kind === "CREATE_PLAN" ? Object.keys(candidate.fields).length : null,
    });
    logCreatePlanResolution("tasks", crypto.randomUUID(), resolution);
    if (resolution.source === "FALLBACK_EMPTY") {
      // Same contract as customer-create: planner failure with nothing
      // reliably extracted must never look like a successful draft. No
      // surface opened, no EXECUTED/COMPLETED — honest CLARIFICATION,
      // rendered by the universal handoff message as a natural request
      // for more detail, not a technical or capability-denial message.
      return result(true, "CLARIFICATION", "UNKNOWN", "CREATE_PLANNER_DEGRADED", { failureCode: "PLANNER_UNAVAILABLE_NO_RELIABLE_FIELDS" });
    }
    const plan = resolution.plan;

    if (plan.kind === "NOT_TASK_CREATE") return result(false, "NOT_HANDLED", "UNKNOWN", "NOT_TASK_OPERATION");
    if (plan.kind === "STATUS_QUERY") return result(true, "EXECUTED", "QUERY", "CREATE_WORKFLOW_STATUS", { fieldNames: Object.keys(state.fields) });
    if (plan.kind === "CANCEL") { this.store.reset(); return result(true, "EXECUTED", "CANCEL", "CREATE_WORKFLOW_CANCELLED"); }
    if (plan.kind === "CLARIFICATION_REQUIRED") return result(true, "CLARIFICATION", "UNKNOWN", "PLANNER_CLARIFICATION_REQUIRED");

    const fields = { ...state.fields, ...plan.fields };
    const missing = !fields.title?.trim();
    this.store.patch({ fields, lifecycle: missing ? "COLLECTING" : "READY", explicitCommitPending: plan.explicitCommit && !missing, operationId });

    const activeSurface = getActiveTaskCreateSurfaceDescriptor();
    const navigationRequested = !activeSurface;
    this.store.patch({ lifecycle: activeSurface ? this.store.get().lifecycle : "OPENING" });

    const changedEntries = Object.entries(plan.fields);
    const navigation = await dispatchTaskNavigationCommand({
      // Stable operationId, not a fresh per-turn id — see
      // customer-create-conversation-coordinator.ts's deliveryInput for the
      // full rationale; same binding applies to the Task Surface/commit chain.
      correlationId: operationId,
      source,
      expectedSurfaceAuthorityKey: "tasks.task.create",
      expectedExecutiveTargetId: taskTargetId("surface", "form"),
      batch: changedEntries.map(([field, value]) => ({ type: "SET" as const, executiveTargetId: taskTargetId("field", `task.${field}`), value })),
      finalFocusTargetId: changedEntries[0] ? taskTargetId("field", `task.${changedEntries[0][0]}`) : undefined,
    }, navigationRequested);

    if (navigation.status !== "COMPLETED") {
      this.store.reset();
      return result(true, "FAILED", "CREATE", "CREATE_NAVIGATION_FAILED", { navigationRequested, navigationStatus: navigationStatusOf(navigation.status), failureCode: "NAVIGATION_FAILED" });
    }
    const surface = getActiveTaskCreateSurfaceDescriptor();
    if (!surface) return result(true, "FAILED", "CREATE", "SURFACE_NOT_ACTIVE", { navigationRequested, navigationStatus: "FAILED", failureCode: "SURFACE_NOT_ACTIVE" });
    this.store.patch({ activeSurfaceToken: surface.token });

    const current = this.store.get();
    if (!current.explicitCommitPending) {
      // lifecycle was forced to "OPENING" above (line ~90) whenever this
      // turn triggered a fresh navigation — i.e. on every first task-create
      // message in a conversation, the single most common case. Re-derive
      // it from the actual field state instead of trusting that stale
      // value, or every first-turn task draft with a real title reports
      // CLARIFICATION ("need more info") while the Living Workspace surface
      // sits fully populated — chat and workspace visibly contradicting
      // each other. Mirrors customer-create-conversation-coordinator.ts's
      // equivalent re-derivation at the same point.
      const ready = Boolean(current.fields.title?.trim());
      this.store.patch({ lifecycle: ready ? "READY" : "COLLECTING" });
      return result(true, ready ? "EXECUTED" : "CLARIFICATION", "CREATE", "CREATE_DRAFT_READY", { fieldNames: Object.keys(plan.fields), navigationRequested, navigationStatus: "COMPLETED" });
    }
    if (!current.fields.title?.trim()) {
      this.store.patch({ lifecycle: "COLLECTING" });
      return result(true, "CLARIFICATION", "CREATE", "CREATE_TITLE_REQUIRED", { fieldNames: ["title"], navigationRequested, navigationStatus: "COMPLETED" });
    }

    this.store.patch({ lifecycle: "SUBMITTING", explicitCommitPending: false });
    const outcome = await dispatchTaskCreateCommand(surface.token, { type: "commit" }, operationId);
    if (outcome.status !== "EXECUTED" || !outcome.navigation) {
      this.store.patch({ lifecycle: "FAILED", lastError: "CREATE_EXECUTION_FAILED" });
      return result(true, "FAILED", "CREATE", "CREATE_EXECUTION_FAILED", { failureCode: "CREATE_EXECUTION_FAILED" });
    }
    this.store.patch({ lifecycle: "SUCCEEDED", lastError: null });
    dispatchTaskNavigation(outcome.navigation);
    return result(true, "EXECUTED", "CREATE", "CREATE_COMMITTED", { fieldNames: Object.keys(current.fields), mutationPerformed: true, navigationRequested, navigationStatus: "COMPLETED" });
  }
}

function taskTargetId(kind: "surface" | "field", name: string) { return `${kind}.tasks.create.${name}`; }
function navigationStatusOf(status: string): string { return ["COMPLETED", "FAILED", "EXPIRED"].includes(status) ? status : "UNKNOWN"; }
function result(handled: boolean, status: TaskCreateConversationResult["status"], operation: TaskCreateConversationResult["operation"], outcomeCode: string, extra: Partial<TaskCreateConversationResult> = {}): TaskCreateConversationResult {
  return { handled, status, operation, outcomeCode, fieldNames: [], mutationPerformed: false, navigationRequested: false, navigationStatus: "NOT_REQUESTED", failureCode: null, operationId: null, ...extra };
}

export const taskCreateConversationCoordinator = new TaskCreateConversationCoordinator();
export function resetTaskManagementConversationForTests() { taskCreateConversationCoordinator.store.reset(); }
