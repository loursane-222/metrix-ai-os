import type { CustomerCreateCommand, CustomerCreateCommandOutcome, CustomerCreateSurfaceRuntime } from "./customer-create-surface-runtime";
// operationId here is the SAME canonical operation identity minted by
// CustomerCreateConversationStateStore and carried as the navigation
// command's correlationId (see customer-create-conversation-coordinator.ts,
// use-customer-create-surface-runtime.ts). Carrying it on this descriptor —
// and requiring it to match at commit dispatch — is what binds mutation to
// the exact operation that opened this Surface, not just to "some token".
let active: { token: string; operationId: string | null; runtime: Pick<CustomerCreateSurfaceRuntime, "getState" | "execute"> } | null = null;
let sequence = 0;
const mountListeners = new Set<(descriptor: ReturnType<typeof getActiveCustomerCreateSurfaceDescriptor>) => void>();
export function registerCustomerCreateSurface(runtime: Pick<CustomerCreateSurfaceRuntime, "getState" | "execute">, operationId: string | null = null) { const token = `ccsc_${++sequence}`; active = { token, operationId, runtime }; const descriptor = getActiveCustomerCreateSurfaceDescriptor(); for (const listener of mountListeners) listener(descriptor); return token; }
export function unregisterCustomerCreateSurface(token: string) { if (active?.token === token) active = null; }
export function getActiveCustomerCreateSurfaceDescriptor() { return active ? { token: active.token, operationId: active.operationId, surface: "customer.create" as const } : null; }
// operationId is optional (defaults to null, which skips the check below)
// so callers outside the canonical create-coordinator flow — e.g. the
// attachment coordinator, which binds/commits the same Surface via a
// different, non-operationId-tracked path — keep working unchanged.
export async function dispatchCustomerCreateCommand(token: string, command: CustomerCreateCommand, operationId: string | null = null): Promise<CustomerCreateCommandOutcome> {
  if (!active || active.token !== token) return { status: "REJECTED", message: "Create surface is no longer active." };
  // A mismatched operationId means this Surface belongs to a different
  // (superseded/expired) operation than the one trying to commit — reject
  // exactly like an inactive surface, not a new failure taxonomy.
  if (operationId !== null && active.operationId !== null && active.operationId !== operationId) return { status: "REJECTED", message: "Create surface belongs to a different operation." };
  return active.runtime.execute(command);
}
export function subscribeCustomerCreateSurfaceMount(listener: (descriptor: NonNullable<ReturnType<typeof getActiveCustomerCreateSurfaceDescriptor>>) => void) { mountListeners.add(listener as never); return () => mountListeners.delete(listener as never); }
export function resetCustomerCreateSurfaceForTests() { active = null; sequence = 0; }
