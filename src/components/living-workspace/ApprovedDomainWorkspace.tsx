"use client";

import type { ReactNode } from "react";

export type ApprovedDomainRow = Readonly<{
  id: string;
  marker: string;
  primaryLabel: string;
  primaryValue: ReactNode;
  secondaryLabel?: string;
  secondaryValue?: ReactNode;
  onOpen?: () => void;
  accessory?: ReactNode;
}>;

/** Presentation-only Domain Workspace V2 shell. Data and handlers remain externally owned. */
export function ApprovedDomainWorkspace({ title, subtitle, kpis, query, searchPlaceholder, onQueryChange, rows, totalCount, page, pageCount, onPageChange, onClose, prelude }: {
  title: string;
  subtitle?: string;
  kpis: ReadonlyArray<{ label: string; value: ReactNode }>;
  query: string;
  searchPlaceholder: string;
  onQueryChange: (value: string) => void;
  rows: readonly ApprovedDomainRow[];
  totalCount: number;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  onClose: () => void;
  prelude?: ReactNode;
}) {
  const first = totalCount ? (page - 1) * 7 + 1 : 0;
  const last = Math.min(page * 7, totalCount);
  return <article className="approved-domain-workspace" data-approved-domain-workspace>
    <header className="approved-domain-header">
      <div className="min-w-0"><h2>Workspace / {title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
      <button aria-label="Çalışma alanını kapat" className="approved-domain-close" onClick={onClose} type="button">×</button>
    </header>
    {kpis.length ? <section aria-label="Domain KPI özeti" className={`approved-domain-kpis approved-domain-kpis-${kpis.length}`}>{kpis.map((kpi) => <div className="approved-domain-kpi" key={kpi.label}><span>{kpi.label}</span><strong>{kpi.value}</strong></div>)}</section> : null}
    <div className="approved-domain-toolbar">
      <label className="approved-domain-search"><span aria-hidden="true">⌕</span><input aria-label={`${title} içinde ara`} onChange={(event) => onQueryChange(event.target.value)} placeholder={searchPlaceholder} type="search" value={query}/></label>
    </div>
    {prelude}
    <section className="approved-domain-table" aria-label={`${title} kayıtları`}>
      <div className="approved-domain-table-head"><span>{rows[0]?.primaryLabel ?? title}</span><span>{rows[0]?.secondaryLabel ?? "Durum"}</span><span /></div>
      <div className="approved-domain-list" role="list">
        {rows.length ? rows.map((row) => <div className="approved-domain-row-wrap" key={row.id} role="listitem">
          {row.onOpen ? <button aria-label={`${String(row.primaryValue)} detayını aç`} className="approved-domain-row" onClick={row.onOpen} type="button">
            <span className="approved-domain-primary"><b aria-hidden="true">{row.marker}</b><span>{row.primaryValue}</span></span>
            <span className="approved-domain-secondary">{row.secondaryValue ?? "—"}</span><span aria-hidden="true" className="approved-domain-chevron">›</span>
          </button> : <div className="approved-domain-row">
            <span className="approved-domain-primary"><b aria-hidden="true">{row.marker}</b><span>{row.primaryValue}</span></span>
            <span className="approved-domain-secondary">{row.secondaryValue ?? "—"}</span><span />
          </div>}{row.accessory}
        </div>) : <p className="approved-domain-empty">Bu görünümde kayıt bulunmuyor.</p>}
      </div>
      <footer className="approved-domain-pagination"><span>{first} – {last} / {totalCount}</span><span className="approved-domain-pages"><button disabled={page <= 1} onClick={() => onPageChange(page - 1)} type="button">‹</button><b>{page}</b><span>/ {pageCount}</span><button disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} type="button">›</button></span></footer>
    </section>
  </article>;
}
