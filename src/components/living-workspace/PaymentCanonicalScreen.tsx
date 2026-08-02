"use client";
import { useEffect } from "react";
import { createWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";
import { CollectionActionsPanel } from "./CollectionActionsPanel";
export function PaymentCanonicalScreen() {
  useEffect(() => { livingWorkspaceRuntime.publish(createWorkspaceDirective({ domain: "payment", source: "system", correlationId: crypto.randomUUID(), presentationMode: "focus" })); }, []);
  return <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-3 overflow-hidden">
    <CollectionActionsPanel/>
    <div className="min-h-0"><LivingWorkspaceHost/></div>
  </div>;
}
