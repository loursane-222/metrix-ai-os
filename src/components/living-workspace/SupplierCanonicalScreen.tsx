"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createSupplierWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";
export function SupplierCanonicalScreen(){const pathname=usePathname();useEffect(()=>{const route=pathname??"/metrix/suppliers";const match=route.match(/^\/metrix\/suppliers\/([^/]+)$/u);const publish=()=>livingWorkspaceRuntime.publish(createSupplierWorkspaceDirective({route,source:"system",correlationId:crypto.randomUUID()}));if(match)void fetch(`/api/suppliers/${encodeURIComponent(match[1]!)}`,{credentials:"include"}).finally(publish);else publish();},[pathname]);return <div className="h-full min-h-0"><LivingWorkspaceHost/></div>}
