"use client";

import type { ReactNode } from "react";

export type WorkspaceField = { label: string; value: ReactNode };

export function WorkspaceSurface({
  title,
  subtitle,
  identity,
  kpis = [],
  fields = [],
  actions,
  children,
  tone = "neutral",
}: {
  title: string;
  subtitle?: string;
  identity?: string;
  kpis?: WorkspaceField[];
  fields?: WorkspaceField[];
  actions?: ReactNode;
  children?: ReactNode;
  tone?: "neutral" | "attention" | "critical";
}) {
  return <article className={`workspace-surface workspace-surface-${tone}`}>
    <header className="workspace-surface-header">
      <div className="min-w-0"><p className="workspace-eyebrow">METRIX çalışma alanı</p><h2>{title}</h2>{subtitle ? <p className="workspace-subtitle">{subtitle}</p> : null}</div>
      {identity ? <span className="workspace-identity">{identity}</span> : null}
    </header>
    {kpis.length ? <div className="workspace-kpis">{kpis.map((item) => <div className="workspace-kpi" key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div> : null}
    {fields.length ? <dl className="workspace-fields">{fields.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl> : null}
    {children ? <div className="workspace-content">{children}</div> : null}
    {actions ? <footer className="workspace-actions">{actions}</footer> : null}
  </article>;
}
