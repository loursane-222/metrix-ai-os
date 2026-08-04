"use client";
import { useEffect, useState } from "react";
import { TaskCreateSurfaceRuntime, type TaskCreateCommand } from "./task-create-surface-runtime";
import { registerTaskCreateSurface, unregisterTaskCreateSurface } from "./task-create-surface-command-channel";
import { executiveNavigationCommandRuntime } from "@/lib/conversation-extensions/conversation-navigation-runtime";
export function useTaskCreateSurfaceRuntime() {
  const [runtime] = useState(() => new TaskCreateSurfaceRuntime());
  const [state, setState] = useState(runtime.getState());
  useEffect(() => {
    const unsubscribe = runtime.subscribe(() => setState(runtime.getState()));
    runtime.mount();
    // Mirrors use-customer-create-surface-runtime.ts: the navigation
    // command that caused this Surface to mount already carries the
    // canonical operation's identity as its correlationId.
    const operationId = executiveNavigationCommandRuntime.getSnapshot()?.correlationId ?? null;
    const token = registerTaskCreateSurface(runtime, operationId);
    return () => { unregisterTaskCreateSurface(token); unsubscribe(); runtime.dispose(); };
  }, [runtime]);
  return { state, execute: (command: TaskCreateCommand) => runtime.execute(command) };
}
