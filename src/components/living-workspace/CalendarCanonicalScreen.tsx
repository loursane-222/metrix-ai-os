"use client";
import { useEffect } from "react";
import { createCalendarWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";
export function CalendarCanonicalScreen() { useEffect(() => { livingWorkspaceRuntime.publish(createCalendarWorkspaceDirective({ source: "system", correlationId: crypto.randomUUID() })); }, []); return <LivingWorkspaceHost />; }
