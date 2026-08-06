import type { ReactNode } from "react";
import { WorkspaceSurface, type WorkspaceField } from "./WorkspaceSurface";

export function ReportSurface({ title, summary, kpis, children }: { title: string; summary?: string; kpis?: WorkspaceField[]; children?: ReactNode }) {
  return <WorkspaceSurface title={title} subtitle={summary} kpis={kpis}><div className="report-sections">{children}</div></WorkspaceSurface>;
}
