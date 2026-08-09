"use client";
import { useEffect } from "react";
import { createProductWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";
export function ProductCanonicalScreen() {
  useEffect(() => { livingWorkspaceRuntime.publish(createProductWorkspaceDirective({ route: "/metrix/products", source: "system", correlationId: crypto.randomUUID() })); }, []);
  return <LivingWorkspaceHost/>;
}
