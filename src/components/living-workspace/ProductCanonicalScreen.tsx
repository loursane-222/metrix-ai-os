"use client";
import { useEffect } from "react";
import { livingWorkspaceRuntime, planWorkspaceDirective } from "@/lib/living-workspace";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";
export function ProductCanonicalScreen() {
  useEffect(() => { const directive = planWorkspaceDirective({ utterance: "Ürünleri göster", source: "system" as never, correlationId: crypto.randomUUID() }); if (directive) livingWorkspaceRuntime.publish({ ...directive, source: "system", presentationMode: "focus" }); }, []);
  return <LivingWorkspaceHost/>;
}
