"use client";
import { useEffect, useState } from "react";
import { CustomerCreateSurfaceRuntime, type CustomerCreateCommand } from "./customer-create-surface-runtime";
import { registerCustomerCreateSurface, unregisterCustomerCreateSurface } from "./customer-create-surface-command-channel";
export function useCustomerCreateSurfaceRuntime() {
  const [runtime] = useState(() => new CustomerCreateSurfaceRuntime());
  const [state, setState] = useState(runtime.getState());
  useEffect(() => { const unsubscribe = runtime.subscribe(() => setState(runtime.getState())); runtime.mount(); const token = registerCustomerCreateSurface(runtime); return () => { unregisterCustomerCreateSurface(token); unsubscribe(); runtime.dispose(); }; }, [runtime]);
  return { state, execute: (command: CustomerCreateCommand) => runtime.execute(command) };
}
