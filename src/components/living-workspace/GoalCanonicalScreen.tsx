"use client";
import { useEffect } from "react";
import { createGoalWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";

export function GoalCanonicalScreen() {
  useEffect(() => { livingWorkspaceRuntime.publish(createGoalWorkspaceDirective({ route: "/metrix/goals", source: "system", correlationId: crypto.randomUUID() })); }, []);
  return <LivingWorkspaceHost/>;
}
