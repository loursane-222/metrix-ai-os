import { executeTaskCreateAction } from "./tasks-client";
import type { ApiResult, CreateTaskBody, TaskActionExecutionResult } from "./tasks-client";
import type { TaskNavigationDescriptor } from "./task-navigation";

export type TaskCreateField = keyof CreateTaskBody;
export type TaskCreateState = { mounted: boolean; draft: CreateTaskBody; submitting: boolean; error: string | null; missingFields: TaskCreateField[]; result: TaskActionExecutionResult | null; navigation: TaskNavigationDescriptor | null };
export type TaskCreateCommand = { type: "set_field"; field: TaskCreateField; value: unknown } | { type: "clear_field"; field: TaskCreateField } | { type: "commit" };
export type TaskCreateCommandOutcome = { status: "EXECUTED" | "MISSING_FIELDS" | "REJECTED" | "FAILED"; missingFields?: TaskCreateField[]; navigation?: TaskNavigationDescriptor; message?: string };
type CreateResult = ApiResult<{ execution: TaskActionExecutionResult & { entityRef?: { entityType: string; entityId: string } } }>;
export type TaskCreateDeps = { executeCreate(body: CreateTaskBody, idempotencyKey: string): Promise<CreateResult>; generateId(): string };
const emptyDraft = (): TaskCreateState["draft"] => ({ title: "" });

export class TaskCreateSurfaceRuntime {
  private state: TaskCreateState = { mounted: false, draft: emptyDraft(), submitting: false, error: null, missingFields: [], result: null, navigation: null };
  private listeners = new Set<() => void>();
  constructor(private deps: TaskCreateDeps = { executeCreate: executeTaskCreateAction, generateId: () => crypto.randomUUID() }) {}
  getState = () => this.state;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  mount = () => { this.patch({ mounted: true }); };
  dispose = () => { this.state = { ...this.state, mounted: false }; this.listeners.clear(); };
  private patch(next: Partial<TaskCreateState>) { this.state = { ...this.state, ...next }; for (const fn of this.listeners) fn(); }
  execute = async (command: TaskCreateCommand): Promise<TaskCreateCommandOutcome> => {
    if (!this.state.mounted) return { status: "REJECTED", message: "Create surface is not mounted." };
    if (command.type === "set_field" || command.type === "clear_field") {
      const value = command.type === "set_field" ? command.value : undefined;
      this.patch({ draft: { ...this.state.draft, [command.field]: value } as CreateTaskBody, error: null });
      return { status: "EXECUTED" };
    }
    if (this.state.submitting) return { status: "REJECTED", message: "Task creation is already in progress." };
    if (!this.state.draft.title.trim()) { this.patch({ missingFields: ["title"], error: "Görev başlığı gerekli." }); return { status: "MISSING_FIELDS", missingFields: ["title"] }; }
    this.patch({ submitting: true, error: null, missingFields: [] });
    const body = Object.fromEntries(Object.entries(this.state.draft).map(([key, value]) => [key, typeof value === "string" ? value.trim() || undefined : value])) as unknown as CreateTaskBody;
    const response = await this.deps.executeCreate(body, this.deps.generateId());
    if (!this.state.mounted) return { status: "REJECTED", message: "Create surface was unmounted." };
    if (!response.ok) { this.patch({ submitting: false, error: response.error }); return { status: "FAILED", message: response.error }; }
    const taskId = response.data.execution.entityRef?.entityId;
    if (!taskId) { const message = "Olusturma sonucu gorev kimligi icermiyor."; this.patch({ submitting: false, error: message }); return { status: "FAILED", message }; }
    const navigation: TaskNavigationDescriptor = { kind: "tasks.list" };
    this.patch({ submitting: false, result: response.data.execution, navigation });
    return { status: "EXECUTED", navigation };
  };
}
