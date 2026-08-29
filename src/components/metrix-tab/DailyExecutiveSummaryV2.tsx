import type { ExecutiveDailyBriefingV2 } from "@/lib/executive-daily-briefing-v2";
import styles from "./DailyExecutiveSummaryV2.module.css";

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
});

export function DailyExecutiveSummaryV2({ briefing, onClose }: { briefing: ExecutiveDailyBriefingV2; onClose?: () => void }) {
  const financial = briefing.financialSnapshot ?? [];
  const agenda = briefing.agenda ?? [];
  const risks = [...briefing.criticalAlerts.map((item) => ({ ...item, level: "critical" as const })), ...briefing.watchSignals.map((item) => ({ ...item, severity: item.reason, level: "watch" as const }))].slice(0, 3);

  return (
    <section aria-label="Bugünün yönetim brifingi" className={styles.summary} data-daily-executive-summary-v2 data-organization-id={briefing.organizationId}>
      <header className={styles.header}>
        <div><span className={styles.brand}>AI</span><p>Günlük yönetici özeti</p></div>
        <div className={styles.headerRight}>
          <time dateTime={briefing.briefingDate}>{formatDate(briefing.briefingDate)}</time>
          {onClose ? <button aria-label="Günlük yönetici özetini kapat" className={styles.closeButton} onClick={onClose} type="button">✕</button> : null}
        </div>
      </header>

      <div className={styles.grid} data-summary-grid>
        <div className={styles.financialColumn} aria-label="Finansal durum" data-summary-column="financial">
          {financial.length > 0 ? financial.map((metric) => (
            <article className={`${styles.card} ${styles.metric}`} key={metric.key}>
              <div className={styles.cardHeading}><h3>{metric.label}</h3><StatusIcon status={metric.status} /></div>
              <p className={styles.metricValue}>{metric.value === null ? "N/A" : money.format(metric.value)}</p>
              <p className={styles.meta}>{metric.detail}</p>
            </article>
          )) : <EmptyCard title="Finansal durum" text="Bugünkü yönetim özeti için canonical finans verisi bulunmuyor." />}
        </div>

        <article className={`${styles.card} ${styles.agenda}`} data-summary-card="agenda">
          <div className={styles.sectionTitle}><h3>Günlük yönetici ajandası</h3><span>{briefing.timezone}</span></div>
          {agenda.length > 0 ? <ol>{agenda.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <time dateTime={item.startsAt ?? undefined}>{item.allDay || !item.startsAt ? "Tüm gün" : formatTime(item.startsAt, briefing.timezone)}</time>
              <span className={styles.timelineDot} aria-hidden="true" />
              <div><strong>{item.title}</strong><span>{item.kind === "TASK" ? "Görev" : calendarStatus(item.status)}</span></div>
            </li>
          ))}</ol> : <div className={styles.empty}><CalendarIcon /><strong>Bugün ajanda boş</strong><p>Planlı etkinlik veya bugün teslim edilecek görev bulunmuyor.</p></div>}
        </article>

        <article className={`${styles.card} ${styles.attention}`} data-summary-card="attention" data-summary-column="attention">
          <div className={styles.sectionTitle}><h3>Yönetici dikkati</h3><span>{riskLabel(briefing.overallRiskLevel)}</span></div>
          <p className={styles.narrative} data-summary-section="narrative">{briefing.executiveNarrativeSummary || briefing.forecastSummary}</p>
          <div className={styles.rule} />
          <h4>Risk sinyalleri</h4>
          {risks.length > 0 ? <ul data-summary-section="risks">{risks.map((risk, index) => (
            <li data-summary-risk-row key={`${risk.title}-${index}`}><RiskIcon level={risk.level} /><div><strong>{risk.title}</strong><span>{risk.severity}</span></div></li>
          ))}</ul> : <div className={styles.safe}><SafeIcon /><p>Bugün için kritik veya izlenecek yönetim sinyali bulunmuyor.</p></div>}
          <details className={styles.contextDetails}>
            <summary>Yönetim bağlamı</summary>
            <p><strong>Tahmin</strong>{briefing.forecastSummary}</p>
            <p><strong>Skor kartı</strong>{briefing.scorecardSummary}</p>
            <p><strong>Farkındalık</strong>{briefing.awarenessSummary}</p>
            <p><strong>Yönetim odağı</strong>{briefing.executiveFocusSummary}</p>
            <p><strong>Sinyal eğilimi</strong>{briefing.signalTrendSummary}</p>
          </details>
          <div className={styles.quality} data-summary-section="quality">{briefing.dataQualityNote}</div>
        </article>
      </div>
    </section>
  );
}

function EmptyCard({ title, text }: { title: string; text: string }) { return <article className={`${styles.card} ${styles.metric} ${styles.emptyMetric}`}><h3>{title}</h3><p>{text}</p></article>; }
function formatDate(value: string) { const [year, month, day] = value.split("-").map(Number); return new Intl.DateTimeFormat("tr-TR", { day:"2-digit", month:"long", year:"numeric", timeZone:"Europe/Istanbul" }).format(new Date(Date.UTC(year, month - 1, day, 9))); }
function formatTime(value: string, timeZone: string) { return new Intl.DateTimeFormat("tr-TR", { hour:"2-digit", minute:"2-digit", hour12:false, timeZone }).format(new Date(value)); }
function calendarStatus(status: string) { return ({ PLANNED:"Planlandı", CONFIRMED:"Onaylandı", POSTPONED:"Ertelendi", COMPLETED:"Tamamlandı" } as Record<string,string>)[status] ?? "Ajanda"; }
function riskLabel(level: string | null) { return ({ HIGH:"Yüksek risk", WATCH:"İzleniyor", LOW:"Dengeli" } as Record<string,string>)[level ?? ""] ?? "Veri sınırlı"; }

function StatusIcon({ status }: { status: string }) { return <svg className={styles.statusIcon} data-status={status} viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="11"/><path d={status === "CRITICAL" ? "M14 7v8m0 5h.01" : "M8 16l4 4 8-11"}/></svg>; }
function CalendarIcon() { return <svg className={styles.emptyIcon} viewBox="0 0 40 40" aria-hidden="true"><rect x="5" y="8" width="30" height="27" rx="5"/><path d="M12 4v8m16-8v8M5 16h30"/></svg>; }
function RiskIcon({ level }: { level: "critical" | "watch" }) { return <svg className={styles.riskIcon} data-level={level} viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15"/><path d={level === "critical" ? "M10 12l8 14 8-14z" : "M18 27c-6 0-10-4-10-9 0-4 3-7 6-10 0 4 1 6 3 7 0-6 4-9 5-13 4 5 3 9 1 12 3-1 4-3 4-5 3 4 4 7 3 10-1 5-6 8-12 8z"}/></svg>; }
function SafeIcon() { return <svg className={styles.safeIcon} viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13"/><path d="M9 16l5 5 9-11"/></svg>; }
