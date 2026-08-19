"use client";
import { useEffect } from "react";
import { createReportWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";
export function ReportCanonicalScreen() { useEffect(() => { const directive = createReportWorkspaceDirective({ route: "/metrix/reports", source: "system", correlationId: crypto.randomUUID() }); if (directive) livingWorkspaceRuntime.publish(directive); }, []); return <LivingWorkspaceHost/>; }
