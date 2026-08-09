"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createDeliveryWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";

export function DeliveryCanonicalScreen() {
  const pathname = usePathname();
  useEffect(() => {
    const route = pathname ?? "/metrix/deliveries";
    const match = route.match(/^\/metrix\/deliveries\/([^/]+)$/u);
    const publish = () => livingWorkspaceRuntime.publish(
      createDeliveryWorkspaceDirective({
        route,
        source: "system",
        correlationId: crypto.randomUUID(),
      }),
    );
    if (match && match[1] !== "new") void fetch(`/api/deliveries/${encodeURIComponent(match[1]!)}`, { credentials: "include", cache: "no-store" }).finally(publish);
    else publish();
  }, [pathname]);
  return <div className="h-full min-h-0"><LivingWorkspaceHost /></div>;
}
