"use client";
import { useEffect } from "react";
import { createKpiWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";

export function KpiCanonicalScreen() {
  useEffect(() => {
    livingWorkspaceRuntime.publish(createKpiWorkspaceDirective({ route: "/metrix/kpis", source: "system", correlationId: crypto.randomUUID() }));
  }, []);
  return <div className="h-full min-h-0"><LivingWorkspaceHost /></div>;
}
