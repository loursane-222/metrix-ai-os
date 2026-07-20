import type { CustomerCreatePlan, CustomerCreatePlanFields } from "./customer-create-conversation-plan";
import type { CustomerCreateCommandOutcome } from "./customer-create-surface-runtime";
export type CustomerCreateLifecycle = "IDLE" | "OPENING" | "COLLECTING" | "READY" | "SUBMITTING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
export type PendingCustomerCreateState = { lifecycle: CustomerCreateLifecycle; fields: CustomerCreatePlanFields; missingFields: Array<"displayName">; lastPlannerOutcome: CustomerCreatePlan | null; lastRuntimeOutcome: CustomerCreateCommandOutcome | null; lastError: string | null; createdCustomerId: string | null; createdCustomerDisplayName: string | null; activeSurfaceToken: string | null; pendingReplay: boolean; explicitCommitPending: boolean; navigationIssued: boolean; guidanceShown: boolean; lastGuidanceReason: "WORKFLOW_OPENED" | "HELP_REQUESTED" | "MISSING_DISPLAY_NAME" | null; guidanceTurnCount: number; updatedAt: number };
const initial = (now: number): PendingCustomerCreateState => ({ lifecycle: "IDLE", fields: {}, missingFields: ["displayName"], lastPlannerOutcome: null, lastRuntimeOutcome: null, lastError: null, createdCustomerId: null, createdCustomerDisplayName: null, activeSurfaceToken: null, pendingReplay: false, explicitCommitPending: false, navigationIssued: false, guidanceShown: false, lastGuidanceReason: null, guidanceTurnCount: 0, updatedAt: now });
export class CustomerCreateConversationStateStore {
  private state: PendingCustomerCreateState;
  constructor(private readonly clock = () => Date.now(), private readonly ttlMs = 30 * 60_000) { this.state = initial(clock()); }
  get() { if (this.clock() - this.state.updatedAt > this.ttlMs) this.state = initial(this.clock()); return this.state; }
  patch(next: Partial<PendingCustomerCreateState>) { this.state = { ...this.get(), ...next, updatedAt: this.clock() }; return this.state; }
  replace(next: PendingCustomerCreateState) { this.state = { ...next, updatedAt: this.clock() }; return this.state; }
  reset() { this.state = initial(this.clock()); return this.state; }
  cancel() { this.state = { ...initial(this.clock()), lifecycle: "CANCELLED", missingFields: ["displayName"] }; return this.state; }
}
