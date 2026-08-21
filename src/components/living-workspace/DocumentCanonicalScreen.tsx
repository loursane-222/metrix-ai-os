"use client";
import { useEffect } from "react";
import { createDocumentWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";

export function DocumentCanonicalScreen() {
  useEffect(() => {
    livingWorkspaceRuntime.publish(createDocumentWorkspaceDirective({ route: "/metrix/documents", source: "system", correlationId: crypto.randomUUID() }));
  }, []);
  return <div className="h-full min-h-0"><LivingWorkspaceHost /></div>;
}
