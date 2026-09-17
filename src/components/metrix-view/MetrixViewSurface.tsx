"use client";

import type { Presentation } from "../../lib/presentation/contracts";
import { CalendarPresentationView } from "./CalendarPresentationView";
import { PRESENTATION_SURFACE_CLASS } from "./presentation-surface";

export function MetrixViewSurface({ presentation }: { presentation: Presentation | null }) {
  if (!presentation) return null;

  if (presentation.type === "LIST") {
    return <section aria-label={presentation.title} className={`${PRESENTATION_SURFACE_CLASS} p-4`}>
      <h2 className="text-base font-semibold text-white">{presentation.title}</h2>
      <p className="mt-1 text-xs text-white/50">{presentation.metrics.map(metric => `${metric.label}: ${metric.value}`).join(" · ")}</p>
      <ul className="mt-3 divide-y divide-white/10">{presentation.rows.map((row, index) => <li className="flex justify-between gap-4 py-2 text-sm" key={row.id ?? index}><span>{row.primary}</span><span className="text-white/55">{row.secondary}</span></li>)}</ul>
    </section>;
  }

  if (presentation.type === "ENTITY") {
    return <section aria-label={presentation.title} className={`${PRESENTATION_SURFACE_CLASS} p-4`}><h2 className="text-base font-semibold text-white">{presentation.title}</h2><dl className="mt-3 grid grid-cols-2 gap-3 text-sm">{presentation.fields.map(field => <div key={field.label}><dt className="text-white/50">{field.label}</dt><dd>{field.value}</dd></div>)}</dl></section>;
  }

  if (presentation.type === "METRICS") return <section aria-label={presentation.title} className={`${PRESENTATION_SURFACE_CLASS} p-4`}><h2>{presentation.title}</h2>{presentation.metrics.map(metric => <p key={metric.label}>{metric.label}: {metric.value}</p>)}</section>;
  if (presentation.type === "CHART") return <section aria-label={presentation.title} className={`${PRESENTATION_SURFACE_CLASS} p-4`}><h2>{presentation.title}</h2>{presentation.series.map(point => <p key={point.label}>{point.label}: {point.value}</p>)}</section>;
  if (presentation.type === "CALENDAR") return <CalendarPresentationView presentation={presentation} />;

  return (
    <section aria-label={presentation.title} className={`${PRESENTATION_SURFACE_CLASS} p-3 sm:p-4`}>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-white">{presentation.title}</h2>
        <span className="text-xs text-white/50">v{presentation.version}</span>
      </div>
      <iframe
        className="h-[520px] w-full rounded-lg border border-white/10 bg-white"
        sandbox=""
        srcDoc={presentation.previewHtml}
        title={presentation.title}
      />
    </section>
  );
}
