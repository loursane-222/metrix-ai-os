"use client";
import { useEffect } from "react";
import { createFinanceWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";
export function FinanceCanonicalScreen() { useEffect(() => { const directive = createFinanceWorkspaceDirective({ route: "/metrix/finance", source: "system", correlationId: crypto.randomUUID() }); if (directive) livingWorkspaceRuntime.publish(directive); }, []); return <LivingWorkspaceHost/>; }
