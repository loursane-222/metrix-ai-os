"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createOrderWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";

export function OrderCanonicalScreen() {
  const pathname = usePathname();
  useEffect(() => {
    const route = pathname ?? "/metrix/orders";
    const match = route.match(/^\/metrix\/orders\/([^/]+)$/u);
    const publish = () => livingWorkspaceRuntime.publish(
      createOrderWorkspaceDirective({
        route,
        source: "system",
        correlationId: crypto.randomUUID(),
      }),
    );
    if (match && match[1] !== "new") void fetch(`/api/orders/${encodeURIComponent(match[1]!)}`, { credentials: "include", cache: "no-store" }).finally(publish);
    else publish();
  }, [pathname]);
  return <div className="h-full min-h-0"><LivingWorkspaceHost /></div>;
}
