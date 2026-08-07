"use client";
import { useEffect } from "react";
import { createTeamWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";

export function TeamCanonicalScreen() {
  useEffect(() => {
    livingWorkspaceRuntime.publish(createTeamWorkspaceDirective({ route: "/metrix/team", source: "system", correlationId: crypto.randomUUID() }));
  }, []);
  return <LivingWorkspaceHost />;
}
