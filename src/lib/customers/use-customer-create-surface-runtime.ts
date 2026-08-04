"use client";
import { useEffect, useState } from "react";
import { CustomerCreateSurfaceRuntime, type CustomerCreateCommand } from "./customer-create-surface-runtime";
import { registerCustomerCreateSurface, unregisterCustomerCreateSurface } from "./customer-create-surface-command-channel";
import { executiveNavigationCommandRuntime } from "@/lib/conversation-extensions/conversation-navigation-runtime";
export function useCustomerCreateSurfaceRuntime() {
  const [runtime] = useState(() => new CustomerCreateSurfaceRuntime());
  const [state, setState] = useState(runtime.getState());
  useEffect(() => {
    const unsubscribe = runtime.subscribe(() => setState(runtime.getState()));
    runtime.mount();
    // The navigation command that caused this Surface to mount already
    // carries the canonical operation's identity as its correlationId (see
    // customer-create-conversation-coordinator.ts) — read it from the same
    // snapshot ExecutiveNavigationCommandHost.tsx already reads, so this
    // Surface's descriptor is bound to the operation that opened it.
    const operationId = executiveNavigationCommandRuntime.getSnapshot()?.correlationId ?? null;
    const token = registerCustomerCreateSurface(runtime, operationId);
    return () => { unregisterCustomerCreateSurface(token); unsubscribe(); runtime.dispose(); };
  }, [runtime]);
  return { state, execute: (command: CustomerCreateCommand) => runtime.execute(command) };
}
