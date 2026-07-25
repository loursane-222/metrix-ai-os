"use client";

export type RuntimeTelemetryContext = {
  correlationId: string;
  turnId: string;
  channel: "voice" | "text";
};

let currentContext: RuntimeTelemetryContext | null = null;

export function setRuntimeTelemetryContext(context: RuntimeTelemetryContext): void {
  currentContext = context;
}

export function getRuntimeTelemetryContext(): RuntimeTelemetryContext | null {
  return currentContext;
}
