"use client";
import { useEffect } from "react";
import { createWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";
export function TaskCanonicalScreen() {
  useEffect(() => { livingWorkspaceRuntime.publish(createWorkspaceDirective({ domain: "task", source: "system", correlationId: crypto.randomUUID(), presentationMode: "focus" })); }, []);
  return <LivingWorkspaceHost/>;
}
