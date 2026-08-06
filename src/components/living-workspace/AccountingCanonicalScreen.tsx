"use client";

import { useEffect } from "react";
import { createWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";

export function AccountingCanonicalScreen() {
  useEffect(() => { livingWorkspaceRuntime.publish(createWorkspaceDirective({ domain: "accounting", source: "system", correlationId: crypto.randomUUID(), presentationMode: "focus" })); }, []);
  return <LivingWorkspaceHost/>;
}
