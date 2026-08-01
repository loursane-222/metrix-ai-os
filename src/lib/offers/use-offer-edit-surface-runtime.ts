"use client";

// React bridge for OfferEditSurfaceRuntime — mirrors use-customer-edit-surface-runtime.ts:
// the runtime, not React, is the source of truth, so a mutation dispatched
// from outside React (the conversational command channel) shows up in the UI
// the same way a local dispatch does.

import { useEffect, useState } from "react";

import {
  createOfferEditSurfaceRuntime,
  createProductionOfferEditSurfaceRuntimeDeps,
  createInitialOfferEditSurfaceState,
  type OfferEditSurfaceRuntime,
  type OfferEditSurfaceState,
  type SurfaceActionInput,
} from "./offer-edit-surface-runtime";
import { registerOfferEditSurfaceTarget, unregisterOfferEditSurfaceTarget } from "./offer-edit-surface-command-channel";

export type UseOfferEditSurfaceRuntimeResult = {
  state: OfferEditSurfaceState;
  executeSurfaceAction: (action: SurfaceActionInput) => Promise<void>;
};

export function useOfferEditSurfaceRuntime(quoteId: string, initialTab: string): UseOfferEditSurfaceRuntimeResult {
  const [runtime, setRuntime] = useState<OfferEditSurfaceRuntime | null>(null);
  const [state, setState] = useState<OfferEditSurfaceState>(() => createInitialOfferEditSurfaceState(initialTab));

  useEffect(() => {
    let cancelled = false;
    const instance = createOfferEditSurfaceRuntime(quoteId, initialTab, createProductionOfferEditSurfaceRuntimeDeps());

    const unsubscribe = instance.subscribe(() => {
      if (!cancelled) setState(instance.getState());
    });

    const registrationToken = registerOfferEditSurfaceTarget({
      entityId: quoteId,
      runtime: { getState: instance.getState, executeSurfaceAction: instance.executeSurfaceAction },
    });

    setRuntime(instance);
    setState(instance.getState());
    void instance.load();

    return () => {
      cancelled = true;
      unsubscribe();
      unregisterOfferEditSurfaceTarget(registrationToken);
      instance.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  return {
    state,
    executeSurfaceAction: (action) => (runtime ? runtime.executeSurfaceAction(action) : Promise.resolve()),
  };
}
