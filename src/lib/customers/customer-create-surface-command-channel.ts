import type { CustomerCreateCommand, CustomerCreateCommandOutcome, CustomerCreateSurfaceRuntime } from "./customer-create-surface-runtime";
let active: { token: string; runtime: Pick<CustomerCreateSurfaceRuntime, "getState" | "execute"> } | null = null;
let sequence = 0;
const mountListeners = new Set<(descriptor: ReturnType<typeof getActiveCustomerCreateSurfaceDescriptor>) => void>();
export function registerCustomerCreateSurface(runtime: Pick<CustomerCreateSurfaceRuntime, "getState" | "execute">) { const token = `ccsc_${++sequence}`; active = { token, runtime }; const descriptor = getActiveCustomerCreateSurfaceDescriptor(); for (const listener of mountListeners) listener(descriptor); return token; }
export function unregisterCustomerCreateSurface(token: string) { if (active?.token === token) active = null; }
export function getActiveCustomerCreateSurfaceDescriptor() { return active ? { token: active.token, surface: "customer.create" as const } : null; }
export async function dispatchCustomerCreateCommand(token: string, command: CustomerCreateCommand): Promise<CustomerCreateCommandOutcome> { if (!active || active.token !== token) return { status: "REJECTED", message: "Create surface is no longer active." }; return active.runtime.execute(command); }
export function subscribeCustomerCreateSurfaceMount(listener: (descriptor: NonNullable<ReturnType<typeof getActiveCustomerCreateSurfaceDescriptor>>) => void) { mountListeners.add(listener as never); return () => mountListeners.delete(listener as never); }
export function resetCustomerCreateSurfaceForTests() { active = null; sequence = 0; }
