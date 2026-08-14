"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { dispatchConversationNavigation } from "@/lib/conversation-extensions/conversation-navigation-runtime";
import { createGoal, type GoalPeriod, type GoalScope, type GoalType } from "@/lib/goals/goals-client";

const inputClass = "w-full rounded-xl border border-white/[.1] bg-white/[.04] px-3 py-2.5 text-sm text-[#EDE7D9] outline-none focus:border-[#34e6cf]/45";
const PERIODS: Array<[GoalPeriod, string]> = [["MONTHLY", "Aylık"], ["QUARTERLY", "Çeyreklik"], ["YEARLY", "Yıllık"], ["CUSTOM", "Özel"]];
const SCOPES: Array<[GoalScope, string]> = [["COMPANY", "Şirket"], ["TEAM", "Ekip"], ["PERSON", "Kişi"], ["CUSTOMER_SEGMENT", "Müşteri segmenti"], ["PRODUCT", "Ürün"], ["BRANCH", "Şube"]];
const TYPES: Array<[GoalType, string]> = [["SALES", "Satış"], ["COLLECTION", "Tahsilat"], ["REVENUE", "Gelir"], ["GROSS_PROFIT", "Brüt kâr"], ["NEW_CUSTOMER", "Yeni müşteri"], ["ACTIVITY", "Aktivite"], ["CUSTOM", "Özel"]];

export function GoalCreateSurface({ onReady }: { onReady?: () => void } = {}) {
  const [draft, setDraft] = useState({ title: "", period: "MONTHLY" as GoalPeriod, scope: "COMPANY" as GoalScope, goalType: "SALES" as GoalType, revenue: "", collection: "", startsAt: "", endsAt: "", currency: "TRY" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { const frame = requestAnimationFrame(() => onReady?.()); return () => cancelAnimationFrame(frame); }, [onReady]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!draft.title.trim()) { setError("Hedef başlığı zorunludur."); return; }
    const revenue = cents(draft.revenue); const collection = cents(draft.collection);
    if (revenue === null || collection === null) { setError("Hedef tutarları geçerli bir sayı olmalıdır."); return; }
    setBusy(true); setError(null);
    const result = await createGoal({ title: draft.title.trim(), period: draft.period, scope: draft.scope, goalType: draft.goalType, currency: draft.currency.trim() || undefined, targetRevenueCents: revenue ?? undefined, targetCollectionCents: collection ?? undefined, startsAt: isoDate(draft.startsAt), endsAt: isoDate(draft.endsAt) });
    if (!result.ok) { setError(result.error); setBusy(false); return; }
    await dispatchConversationNavigation({ route: `/metrix/goals/${encodeURIComponent(result.data.goal.id)}`, source: "written", correlationId: crypto.randomUUID(), expectedSurfaceAuthorityKey: "goals.detail.page" });
  }
  const set = (key: keyof typeof draft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  return <div className="mx-auto max-w-5xl space-y-4 pb-8" data-goal-create-surface><header><p className="text-xs uppercase tracking-[.18em] text-[#7C7466]">Hedef çalışma alanı</p><h2 className="mt-1 text-xl font-semibold text-[#EDE7D9]">Yeni hedef oluştur</h2><p className="mt-1 text-sm text-[#A79F91]">Ölçülebilir dönem, kapsam ve finansal hedefleri belirleyin.</p></header>{error ? <Message>{error}</Message> : null}<form className="space-y-4" onSubmit={submit}><Card title="Hedef tanımı"><div className="grid gap-3 md:grid-cols-2"><Input label="Başlık" required value={draft.title} onChange={(v) => set("title", v)}/><Select label="Dönem" value={draft.period} onChange={(v) => set("period", v)} options={PERIODS}/><Select label="Kapsam" value={draft.scope} onChange={(v) => set("scope", v)} options={SCOPES}/><Select label="Hedef türü" value={draft.goalType} onChange={(v) => set("goalType", v)} options={TYPES}/></div></Card><Card title="Ölçüm ve dönem"><div className="grid gap-3 md:grid-cols-2"><Input label="Hedef gelir (₺)" min="0" step="0.01" type="number" value={draft.revenue} onChange={(v) => set("revenue", v)}/><Input label="Hedef tahsilat (₺)" min="0" step="0.01" type="number" value={draft.collection} onChange={(v) => set("collection", v)}/><Input label="Başlangıç tarihi" type="date" value={draft.startsAt} onChange={(v) => set("startsAt", v)}/><Input label="Bitiş tarihi" type="date" value={draft.endsAt} onChange={(v) => set("endsAt", v)}/><Input label="Para birimi" value={draft.currency} onChange={(v) => set("currency", v)}/></div></Card><div className="flex justify-end"><button className="rounded-xl bg-[#34e6cf] px-4 py-2.5 text-sm font-bold text-[#14120F] disabled:opacity-40" disabled={busy || !draft.title.trim()} type="submit">Hedefi oluştur</button></div></form></div>;
}

function cents(value: string): number | undefined | null { if (!value.trim()) return undefined; const number = Number(value.replace(",", ".")); return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null; }
function isoDate(value: string): string | undefined { return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : undefined; }
function Card({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-[20px] border border-white/[.08] bg-white/[.035] p-4"><h3 className="mb-3 text-sm font-semibold text-[#EDE7D9]">{title}</h3>{children}</section>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-xs font-medium text-[#A79F91]"><span className="mb-1.5 block">{label}</span>{children}</label>; }
function Input({ label, value, onChange, ...props }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; min?: string; step?: string }) { return <Field label={label}><input aria-label={label} className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} {...props}/></Field>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) { return <Field label={label}><select aria-label={label} className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></Field>; }
function Message({ children }: { children: ReactNode }) { return <p className="rounded-xl border border-[#f16a7a]/20 bg-[#f16a7a]/10 p-3 text-sm text-[#f16a7a]" role="alert">{children}</p>; }
