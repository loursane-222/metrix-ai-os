"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createSupplierWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";
export function SupplierCanonicalScreen(){const pathname=usePathname();useEffect(()=>{livingWorkspaceRuntime.publish(createSupplierWorkspaceDirective({route:pathname?.startsWith("/metrix/suppliers/new")?"/metrix/suppliers/new":"/metrix/suppliers",source:"system",correlationId:crypto.randomUUID()}));},[pathname]);return <div className="h-full min-h-0"><LivingWorkspaceHost/></div>}
