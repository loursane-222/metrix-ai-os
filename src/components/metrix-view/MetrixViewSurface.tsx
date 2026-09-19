"use client";

import type { Presentation } from "../../lib/presentation/contracts";
import { CalendarPresentationView } from "./CalendarPresentationView";
import { SecureCredentialPresentationView } from "./SecureCredentialPresentationView";
import { PRESENTATION_SURFACE_CLASS } from "./presentation-surface";

export function MetrixViewSurface({
  presentation,
  onPrompt
}: {
  presentation: Presentation | null;
  // Sends a row's own natural-language request back to METRIX. Absent
  // where there is no conversation to send it to (rows are then plain).
  onPrompt?: (text: string) => void;
}) {
  if (!presentation) return null;

  if (presentation.type === "LIST") {
    return <section aria-label={presentation.title} className={`${PRESENTATION_SURFACE_CLASS} p-4`}>
      <h2 className="text-base font-semibold text-white">{presentation.title}</h2>
      <p className="mt-1 text-xs text-white/50">{presentation.metrics.map(metric => `${metric.label}: ${metric.value}`).join(" · ")}</p>
      <ul className="mt-3 divide-y divide-white/10">{presentation.rows.map((row, index) => {
        const content = <>
          <span className={row.unread ? "font-semibold text-white" : undefined}>{row.unread ? <span aria-label="Okunmadı" className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle" /> : null}{row.primary}</span>
          <span className="text-white/55">{row.secondary}</span>
        </>;

        return <li key={row.id ?? index}>{row.prompt && onPrompt
          ? <button className="flex w-full justify-between gap-4 py-2 text-left text-sm transition hover:bg-white/[0.04]" onClick={() => onPrompt(row.prompt!)} type="button">{content}</button>
          : <div className="flex justify-between gap-4 py-2 text-sm">{content}</div>}</li>;
      })}</ul>
    </section>;
  }

  if (presentation.type === "MAIL") {
    return <section aria-label={presentation.title} className={`${PRESENTATION_SURFACE_CLASS} p-4`}>
      <h2 className="text-base font-semibold text-white">{presentation.subject}</h2>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-white/55">
        <dt>Gönderen</dt><dd className="text-white/80">{presentation.from || "—"}</dd>
        {presentation.to ? <><dt>Alıcı</dt><dd className="text-white/80">{presentation.to}</dd></> : null}
        {presentation.date ? <><dt>Tarih</dt><dd className="text-white/80">{presentation.date}</dd></> : null}
        {presentation.threadCount > 0 ? <><dt>Yazışma</dt><dd className="text-white/80">Bu konuşmada {presentation.threadCount} mesaj daha var</dd></> : null}
      </dl>
      <div className="mt-3 max-h-[420px] overflow-y-auto whitespace-pre-wrap break-words border-t border-white/10 pt-3 text-sm leading-relaxed text-white/85">{presentation.body || "Bu mailin metin içeriği yok."}</div>
      {presentation.bodyTruncated ? <p className="mt-2 text-xs text-white/45">Mail uzun olduğu için metnin yalnız ilk bölümü gösteriliyor.</p> : null}
    </section>;
  }

  if (presentation.type === "ENTITY") {
    return <section aria-label={presentation.title} className={`${PRESENTATION_SURFACE_CLASS} p-4`}><h2 className="text-base font-semibold text-white">{presentation.title}</h2><dl className="mt-3 grid grid-cols-2 gap-3 text-sm">{presentation.fields.map(field => <div key={field.label}><dt className="text-white/50">{field.label}</dt><dd>{field.value}</dd></div>)}</dl></section>;
  }

  if (presentation.type === "METRICS") return <section aria-label={presentation.title} className={`${PRESENTATION_SURFACE_CLASS} p-4`}><h2>{presentation.title}</h2>{presentation.metrics.map(metric => <p key={metric.label}>{metric.label}: {metric.value}</p>)}</section>;
  if (presentation.type === "CHART") return <section aria-label={presentation.title} className={`${PRESENTATION_SURFACE_CLASS} p-4`}><h2>{presentation.title}</h2>{presentation.series.map(point => <p key={point.label}>{point.label}: {point.value}</p>)}</section>;
  if (presentation.type === "CALENDAR") return <CalendarPresentationView presentation={presentation} />;

  if (presentation.type === "SECURE_CREDENTIAL") {
    return <SecureCredentialPresentationView onPrompt={onPrompt} presentation={presentation} />;
  }

  if (presentation.type === "CONNECT_ACTION") {
    return (
      <section aria-label={presentation.title} className={`${PRESENTATION_SURFACE_CLASS} p-4`}>
        <h2 className="text-base font-semibold text-white">{presentation.title}</h2>
        <p className="mt-1 text-xs text-white/60">{presentation.description}</p>
        <a
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300"
          href={presentation.connectUrl}
        >
          {presentation.title}
        </a>
      </section>
    );
  }

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
