"use client";

import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

export type AtmosphereAssessment = {
  assessmentId: string;
  status: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  confidence: "LOW" | "MEDIUM" | "HIGH";
  risks: Array<{ severity: string }>;
  evidence: Array<{ id?: string; evidenceId?: string; summary: string; sourceDomain: string }>;
};

type AtmosphereAssessmentContextValue = {
  assessment: AtmosphereAssessment | null;
  setAssessment: Dispatch<SetStateAction<AtmosphereAssessment | null>>;
};

// Preview and isolated component surfaces can render without the application shell.
// Keep a stable no-op context there; the canonical shell still supplies the real
// provider instance used by both conversation and workspace.
const standaloneAssessmentContext: AtmosphereAssessmentContextValue = {
  assessment: null,
  setAssessment: () => undefined,
};
const AtmosphereAssessmentContext = createContext<AtmosphereAssessmentContextValue>(standaloneAssessmentContext);

export function AtmosphereAssessmentProvider({ children }: { children: ReactNode }) {
  const [assessment, setAssessment] = useState<AtmosphereAssessment | null>(null);
  const value = useMemo(() => ({ assessment, setAssessment }), [assessment]);
  return <AtmosphereAssessmentContext.Provider value={value}>{children}</AtmosphereAssessmentContext.Provider>;
}

export function useAtmosphereAssessment(): AtmosphereAssessmentContextValue {
  return useContext(AtmosphereAssessmentContext);
}

export function atmosphereTone(value: AtmosphereAssessment | null): "neutral" | "positive" | "attention" | "critical" {
  if (!value || value.status === "UNAVAILABLE") return "neutral";
  const highest = value.risks.reduce((score, risk) => Math.max(score, risk.severity === "CRITICAL" ? 3 : risk.severity === "HIGH" ? 2 : risk.severity === "MEDIUM" ? 1 : 0), 0);
  if (highest >= 3) return "critical";
  if (highest >= 1) return "attention";
  return value.confidence === "HIGH" ? "positive" : "neutral";
}
