"use client";
import { useEffect } from "react";
import { createPaymentWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";
export function PaymentCanonicalScreen() {
  useEffect(() => { livingWorkspaceRuntime.publish(createPaymentWorkspaceDirective({ route: "/metrix/collections", source: "system", correlationId: crypto.randomUUID() })); }, []);
  return <div className="h-full min-h-0"><LivingWorkspaceHost/></div>;
}
