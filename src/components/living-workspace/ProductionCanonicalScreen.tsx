"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createProductionWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";
export function ProductionCanonicalScreen(){const pathname=usePathname();useEffect(()=>{const route=pathname??"/metrix/production";const match=route.match(/^\/metrix\/production\/([^/]+)$/u);const publish=()=>livingWorkspaceRuntime.publish(createProductionWorkspaceDirective({route,source:"system",correlationId:crypto.randomUUID()}));if(match&&match[1]!=="new")void fetch(`/api/production/${encodeURIComponent(match[1]!)}`,{credentials:"include"}).finally(publish);else publish();},[pathname]);return <div className="h-full min-h-0"><LivingWorkspaceHost/></div>}
