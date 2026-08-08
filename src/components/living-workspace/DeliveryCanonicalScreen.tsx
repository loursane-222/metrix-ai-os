"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createDeliveryWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";

export function DeliveryCanonicalScreen() {
  const pathname = usePathname();
  useEffect(() => {
    livingWorkspaceRuntime.publish(
      createDeliveryWorkspaceDirective({
        route: pathname?.startsWith("/metrix/deliveries/new") ? "/metrix/deliveries/new" : "/metrix/deliveries",
        source: "system",
        correlationId: crypto.randomUUID(),
      }),
    );
  }, [pathname]);
  return <div className="h-full min-h-0"><LivingWorkspaceHost /></div>;
}
