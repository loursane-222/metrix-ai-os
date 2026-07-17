"use client";

// React bridge for CustomerEditSurfaceRuntime. The runtime — not React — is
// the source of truth for customer/draft/tab/save state; this hook only
// subscribes to it and re-renders on every change. That means a mutation
// dispatched from outside React (an external caller holding this runtime
// instance and calling executeSurfaceAction directly) shows up in the UI the
// same way a mutation the component itself triggers does — CustomerEditScreen
// never has its own setDraftSnapshot()/setCustomer() state to fall out of sync.

import { useEffect, useState } from "react";

import {
  createCustomerEditSurfaceRuntime,
  createInitialCustomerEditSurfaceState,
  type CustomerEditSurfaceRuntime,
  type CustomerEditSurfaceState,
  type SurfaceActionInput,
} from "./customer-edit-surface-runtime";

export type UseCustomerEditSurfaceRuntimeResult = {
  state: CustomerEditSurfaceState;
  executeSurfaceAction: (action: SurfaceActionInput) => Promise<void>;
  archive: () => Promise<void>;
};

export function useCustomerEditSurfaceRuntime(
  customerId: string,
  initialTab: string,
): UseCustomerEditSurfaceRuntimeResult {
  const [runtime, setRuntime] = useState<CustomerEditSurfaceRuntime | null>(null);
  const [state, setState] = useState<CustomerEditSurfaceState>(() => createInitialCustomerEditSurfaceState(initialTab));

  useEffect(() => {
    let cancelled = false;
    const instance = createCustomerEditSurfaceRuntime(customerId, initialTab);

    const unsubscribe = instance.subscribe(() => {
      if (!cancelled) setState(instance.getState());
    });

    setRuntime(instance);
    setState(instance.getState());
    void instance.load();

    return () => {
      cancelled = true;
      unsubscribe();
      instance.dispose();
    };
    // Recreate only when customerId changes — initialTab is a mount-time
    // constant for a given Customer Edit screen, same as before.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  return {
    state,
    executeSurfaceAction: (action) => (runtime ? runtime.executeSurfaceAction(action) : Promise.resolve()),
    archive: () => (runtime ? runtime.archive() : Promise.resolve()),
  };
}
