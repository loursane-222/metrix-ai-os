"use client";

import { useSyncExternalStore } from "react";
import type { ActiveWorkspaceContext } from "./contracts";
import { livingWorkspaceRuntime } from "./runtime";

export function useActiveWorkspaceContext(): ActiveWorkspaceContext | null {
  const directive = useSyncExternalStore(
    livingWorkspaceRuntime.subscribe,
    livingWorkspaceRuntime.getSnapshot,
    () => null,
  );

  const surfaceOpen = useSyncExternalStore(
    livingWorkspaceRuntime.subscribeSurfaceOpen,
    livingWorkspaceRuntime.getSurfaceOpenSnapshot,
    () => false,
  );

  const activeContextOverride = useSyncExternalStore(
    livingWorkspaceRuntime.subscribeActiveContextOverride,
    livingWorkspaceRuntime.getActiveContextOverrideSnapshot,
    () => null,
  );

  if (!directive || !surfaceOpen) return null;

  return activeContextOverride ?? {
    domain: directive.domain,
    businessSurface: directive.businessSurface ?? null,
    entityType: directive.entityType ?? null,
    entityId: directive.entityId ?? null,
    title: directive.title,
  };
}
