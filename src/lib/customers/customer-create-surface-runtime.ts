import { executeCustomerCreateAction } from "./customers-client";
import type { ApiResult, CreateCustomerBody, CustomerActionExecutionResult } from "./customers-client";
import type { CustomerNavigationDescriptor } from "./customer-navigation";

export type CustomerCreateField = keyof CreateCustomerBody | `${"primaryContact" | "billingAddress" | "shippingAddress" | "commercialTerms"}.${string}` | `custom.${string}`;
export type CustomerCreateState = { mounted: boolean; draft: CreateCustomerBody; submitting: boolean; error: string | null; missingFields: CustomerCreateField[]; result: CustomerActionExecutionResult | null; navigation: CustomerNavigationDescriptor | null; ingestionAttachmentRef?: string };
export type CustomerCreateCommand = { type: "set_field"; field: CustomerCreateField; value: unknown } | { type: "clear_field"; field: CustomerCreateField } | { type: "bind_ingestion"; attachmentRef: string } | { type: "commit" };
export type CustomerCreateCommandOutcome = { status: "EXECUTED" | "MISSING_FIELDS" | "REJECTED" | "FAILED"; missingFields?: CustomerCreateField[]; navigation?: CustomerNavigationDescriptor; message?: string };
type CreateResult = ApiResult<{ execution: CustomerActionExecutionResult & { entityRef?: { entityType: string; entityId: string } } }>;
export type CustomerCreateDeps = { executeCreate(body: CreateCustomerBody, idempotencyKey: string, attachmentRef?: string): Promise<CreateResult>; generateId(): string };
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
    if (command.type === "bind_ingestion") { this.patch({ ingestionAttachmentRef: command.attachmentRef }); return { status: "EXECUTED" }; }
    if (command.type === "set_field" || command.type === "clear_field") {
      const [root, nested] = command.field.split("."); const value = command.type === "set_field" ? command.value : undefined;
      const draft = root === "custom" && nested ? { ...this.state.draft, customFields: [...(this.state.draft.customFields ?? []).filter((item) => item.definitionId !== nested), ...(value === undefined ? [] : [{ definitionId: nested, value }])] } : nested ? { ...this.state.draft, [root]: { ...((this.state.draft[root as keyof CreateCustomerBody] as Record<string, unknown> | undefined) ?? {}), [nested]: value } } : { ...this.state.draft, [root]: value };
      this.patch({ draft: draft as CreateCustomerBody, error: null });
      return { status: "EXECUTED" };
    }
    if (this.state.submitting) return { status: "REJECTED", message: "Customer creation is already in progress." };
    if (!this.state.draft.displayName.trim()) { this.patch({ missingFields: ["displayName"], error: "Firma adi gerekli." }); return { status: "MISSING_FIELDS", missingFields: ["displayName"] }; }
    this.patch({ submitting: true, error: null, missingFields: [] });
    const body = Object.fromEntries(Object.entries(this.state.draft).map(([key, value]) => [key, typeof value === "string" ? value.trim() || undefined : value])) as unknown as CreateCustomerBody;
    const response = await this.deps.executeCreate(body, this.deps.generateId(), this.state.ingestionAttachmentRef);
    if (!this.state.mounted) return { status: "REJECTED", message: "Create surface was unmounted." };
    if (!response.ok) { this.patch({ submitting: false, error: response.error }); return { status: "FAILED", message: response.error }; }
    const customerId = response.data.execution.entityRef?.entityId;
    if (!customerId) { const message = "Olusturma sonucu musteri kimligi icermiyor."; this.patch({ submitting: false, error: message }); return { status: "FAILED", message }; }
    const navigation: CustomerNavigationDescriptor = { kind: "customer.detail", customerId };
    this.patch({ submitting: false, result: response.data.execution, navigation });
    return { status: "EXECUTED", navigation };
  };
}
