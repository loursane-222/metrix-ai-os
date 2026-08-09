"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createStockWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";

export function StockCanonicalScreen() {
  const pathname = usePathname();
  useEffect(() => {
    livingWorkspaceRuntime.publish(
      createStockWorkspaceDirective({
        route: pathname?.startsWith("/metrix/stock/new") ? "/metrix/stock/new" : "/metrix/stock",
        source: "system",
        correlationId: crypto.randomUUID(),
      }),
    );
  }, [pathname]);
  return <div className="h-full min-h-0"><LivingWorkspaceHost /></div>;
}
