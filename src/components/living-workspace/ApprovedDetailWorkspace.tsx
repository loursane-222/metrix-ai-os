"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

export type ApprovedDetailField = Readonly<{ label: string; value: ReactNode }>;

/** Presentation-only V2 detail shell. Entity state, data and actions stay externally owned. */
export function ApprovedDetailWorkspace({ title, marker, context, fields, metrics, onBack, children }: {
  title: ReactNode;
  marker: string;
  context?: ReactNode;
  fields: readonly ApprovedDetailField[];
  metrics: readonly ApprovedDetailField[];
  onBack: () => void;
  children?: ReactNode;
}) {
  const [phase, setPhase] = useState<"open" | "closing">("open");
  const closeTimer = useRef<number | null>(null);
  useEffect(() => () => { if (closeTimer.current !== null) window.clearTimeout(closeTimer.current); }, []);
  function close() {
    if (phase === "closing") return;
    setPhase("closing");
    closeTimer.current = window.setTimeout(onBack, 420);
  }
  const summaryFields = fields.slice(0, 8);
  return <article className="approved-detail-workspace" data-approved-detail-workspace data-presentation-phase={phase}>
    <header className="approved-detail-header">
      <div className="approved-detail-identity"><b aria-hidden="true">{marker}</b><div><h2>{title}</h2>{context ? <p>{context}</p> : null}</div></div>
      <button aria-label="Domain çalışma alanına dön" className="approved-detail-back" onClick={close} type="button">←</button>
    </header>
    <nav aria-label="Detay bölümleri" className="approved-detail-tabs"><span aria-current="page">Genel Bilgiler</span>{children ? <span>İşlemler</span> : null}</nav>
    <div className="approved-detail-body">
      {summaryFields.length ? <section className="approved-detail-summary"><div className="approved-detail-card"><h3>Entity Bilgileri</h3><dl>{summaryFields.map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl></div><div className="approved-detail-card approved-detail-context"><h3>Canonical Özet</h3><p>{context ?? "Mevcut canonical entity bilgileri"}</p></div></section> : null}
      {metrics.length ? <section aria-label="Entity metrikleri" className="approved-detail-metrics">{metrics.slice(0, 5).map((metric) => <div className="approved-detail-metric" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong></div>)}</section> : null}
      {children ? <section aria-label="Mevcut entity işlemleri" className="approved-detail-action-surface"><h3>Entity İşlemleri</h3>{children}</section> : null}
    </div>
  </article>;
}
