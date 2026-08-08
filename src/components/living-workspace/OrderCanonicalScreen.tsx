"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createOrderWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";

export function OrderCanonicalScreen() {
  const pathname = usePathname();
  useEffect(() => {
    livingWorkspaceRuntime.publish(
      createOrderWorkspaceDirective({
        route: pathname?.startsWith("/metrix/orders/new") ? "/metrix/orders/new" : "/metrix/orders",
        source: "system",
        correlationId: crypto.randomUUID(),
      }),
    );
  }, [pathname]);
  return <div className="h-full min-h-0"><LivingWorkspaceHost /></div>;
}
