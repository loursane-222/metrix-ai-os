import { executeCustomerCreateAction } from "./customers-client";
import type { ApiResult, CreateCustomerBody, CustomerActionExecutionResult } from "./customers-client";
import type { CustomerNavigationDescriptor } from "./customer-navigation";

export type CustomerCreateField = keyof CreateCustomerBody;
export type CustomerCreateState = { mounted: boolean; draft: Record<CustomerCreateField, string>; submitting: boolean; error: string | null; missingFields: CustomerCreateField[]; result: CustomerActionExecutionResult | null; navigation: CustomerNavigationDescriptor | null };
export type CustomerCreateCommand = { type: "set_field"; field: CustomerCreateField; value: string } | { type: "clear_field"; field: CustomerCreateField } | { type: "commit" };
export type CustomerCreateCommandOutcome = { status: "EXECUTED" | "MISSING_FIELDS" | "REJECTED" | "FAILED"; missingFields?: CustomerCreateField[]; navigation?: CustomerNavigationDescriptor; message?: string };
type CreateResult = ApiResult<{ execution: CustomerActionExecutionResult & { entityRef?: { entityType: string; entityId: string } } }>;
export type CustomerCreateDeps = { executeCreate(body: CreateCustomerBody, idempotencyKey: string): Promise<CreateResult>; generateId(): string };
const emptyDraft = (): CustomerCreateState["draft"] => ({ displayName: "", legalName: "", phone: "", email: "", metrixNote: "" });

export class CustomerCreateSurfaceRuntime {
  private state: CustomerCreateState = { mounted: false, draft: emptyDraft(), submitting: false, error: null, missingFields: [], result: null, navigation: null };
  private listeners = new Set<() => void>();
  constructor(private deps: CustomerCreateDeps = { executeCreate: executeCustomerCreateAction, generateId: () => crypto.randomUUID() }) {}
  getState = () => this.state;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  mount = () => { this.patch({ mounted: true }); };
  dispose = () => { this.state = { ...this.state, mounted: false }; this.listeners.clear(); };
  private patch(next: Partial<CustomerCreateState>) { this.state = { ...this.state, ...next }; for (const fn of this.listeners) fn(); }
  execute = async (command: CustomerCreateCommand): Promise<CustomerCreateCommandOutcome> => {
    if (!this.state.mounted) return { status: "REJECTED", message: "Create surface is not mounted." };
    if (command.type === "set_field" || command.type === "clear_field") {
      this.patch({ draft: { ...this.state.draft, [command.field]: command.type === "set_field" ? command.value : "" }, error: null });
      return { status: "EXECUTED" };
    }
    if (this.state.submitting) return { status: "REJECTED", message: "Customer creation is already in progress." };
    if (!this.state.draft.displayName.trim()) { this.patch({ missingFields: ["displayName"], error: "Firma adi gerekli." }); return { status: "MISSING_FIELDS", missingFields: ["displayName"] }; }
    this.patch({ submitting: true, error: null, missingFields: [] });
    const body = Object.fromEntries(Object.entries(this.state.draft).map(([key, value]) => [key, value.trim() || undefined])) as CreateCustomerBody;
    const response = await this.deps.executeCreate(body, this.deps.generateId());
    if (!this.state.mounted) return { status: "REJECTED", message: "Create surface was unmounted." };
    if (!response.ok) { this.patch({ submitting: false, error: response.error }); return { status: "FAILED", message: response.error }; }
    const customerId = response.data.execution.entityRef?.entityId;
    if (!customerId) { const message = "Olusturma sonucu musteri kimligi icermiyor."; this.patch({ submitting: false, error: message }); return { status: "FAILED", message }; }
    const navigation: CustomerNavigationDescriptor = { kind: "customer.detail", customerId };
    this.patch({ submitting: false, result: response.data.execution, navigation });
    return { status: "EXECUTED", navigation };
  };
}
