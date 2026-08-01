"use client";
import { useEffect, useState } from "react";
import { TaskCreateSurfaceRuntime, type TaskCreateCommand } from "./task-create-surface-runtime";
import { registerTaskCreateSurface, unregisterTaskCreateSurface } from "./task-create-surface-command-channel";
export function useTaskCreateSurfaceRuntime() {
  const [runtime] = useState(() => new TaskCreateSurfaceRuntime());
  const [state, setState] = useState(runtime.getState());
  useEffect(() => { const unsubscribe = runtime.subscribe(() => setState(runtime.getState())); runtime.mount(); const token = registerTaskCreateSurface(runtime); return () => { unregisterTaskCreateSurface(token); unsubscribe(); runtime.dispose(); }; }, [runtime]);
  return { state, execute: (command: TaskCreateCommand) => runtime.execute(command) };
}
