"use client";

import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { universalInputRegistry } from "@/lib/input-authority";
import { PAGE_BACKGROUND } from "@/components/customers/ui";

type CompanyGoalStatus = {
  monthlyTarget: number;
  monthToDateRevenue: number;
  forecastedMonthEndRevenue: number;
  goalAchievementRate: number;
  monthToDateCashCollection: number;
};

type RepGoalStatus = {
  visitTarget: number | null;
  visitActual: number;
  salesTarget: number | null;
  salesActual: number;
  collectionTarget: number | null;
  collectionActual: number;
  repCount?: number;
};

type RepPerformanceRow = { userId: string; fullName: string; goalStatus: RepGoalStatus };

type PerformanceDashboardData =
  | { scope: "MANAGER"; companyGoalStatus: CompanyGoalStatus | null; teamGoalStatus: RepGoalStatus | null; reps: RepPerformanceRow[] }
  | { scope: "SELF"; companyGoalStatus: CompanyGoalStatus | null; personalGoalStatus: RepGoalStatus | null };

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const pct = (rate: number) => `%${Math.round(rate * 100)}`;

async function fetchDashboard(): Promise<PerformanceDashboardData> {
  const response = await fetch("/api/rep-goals/performance-dashboard", { credentials: "same-origin" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "Performans panosu yüklenemedi.");
  return payload.data.dashboard as PerformanceDashboardData;
}

export function PerformanceDashboardScreen({ onReady }: { onReady?: () => void }) {
  const [data, setData] = useState<PerformanceDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const registration = universalInputRegistry.register({
      descriptor: { executiveTargetId: "performance-dashboard-page", authorityKey: "goals.performance.page", targetKind: "page", module: "rep-goals", label: "Performans Panosu", readable: true, visibility: "visible", active: true, mounted: true },
      adapter: {},
    });
    return () => { universalInputRegistry.unregister(registration.descriptor.executiveTargetId, registration.registrationToken); };
  }, []);

  const load = useCallback(async () => {
    try {
      setData(await fetchDashboard());
      setError(null);
      onReady?.();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, [onReady]);
  useEffect(() => { void load(); }, [load]);

  if (error && !data) return <State text={error} />;
  if (!data) return <State text="Performans panosu hazırlanıyor…" />;

  return (
    <main className="min-h-full overflow-x-hidden text-[#f4f7f8] [color-scheme:dark]" style={{ background: PAGE_BACKGROUND }}>
      <div className="mx-auto max-w-[1180px] px-4 pb-8 pt-6 sm:px-6">
        <header>
          <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[#34e6cf]">Performans · Hedef Gerçekleşme</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Performans Panosu</h1>
        </header>

        {data.companyGoalStatus ? <CompanySection status={data.companyGoalStatus} /> : <EmptyCard title="Şirket Aylık Hedefi" text="Bu ay için aktif bir şirket geneli satış hedefi tanımlanmamış." />}

        {data.scope === "MANAGER" ? <ManagerSections data={data} /> : <SelfSection status={data.personalGoalStatus} />}
      </div>
    </main>
  );
}

function CompanySection({ status }: { status: CompanyGoalStatus }) {
  return (
    <section className="mt-6 rounded-[28px] border border-white/[.08] bg-white/[.035] p-5 backdrop-blur-xl sm:p-6">
      <h2 className="text-sm font-semibold uppercase tracking-[.1em] text-[#34e6cf]">Şirket Aylık Hedefi</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Aylık Hedef" value={money.format(status.monthlyTarget)} tone="blue" />
        <Kpi label="Gerçekleşen Gelir" value={money.format(status.monthToDateRevenue)} tone="cyan" />
        <Kpi label="Tahmini Ay Sonu" value={money.format(status.forecastedMonthEndRevenue)} tone="amber" />
        <Kpi label="Gerçekleşme Oranı" value={pct(status.goalAchievementRate)} tone="green" />
      </div>
    </section>
  );
}

function SelfSection({ status }: { status: RepGoalStatus | null }) {
  if (!status) return <EmptyCard title="Kişisel Hedefim" text="Bu ay için tanımlanmış aktif bir kişisel hedefiniz yok." />;
  return (
    <section className="mt-6 rounded-[28px] border border-white/[.08] bg-white/[.035] p-5 backdrop-blur-xl sm:p-6">
      <h2 className="text-sm font-semibold uppercase tracking-[.1em] text-[#34e6cf]">Kişisel Hedefim</h2>
      <div className="mt-4"><GoalBarChart rows={[{ name: "Ben", goalStatus: status }]} /></div>
    </section>
  );
}

function ManagerSections({ data }: { data: Extract<PerformanceDashboardData, { scope: "MANAGER" }> }) {
  return (
    <>
      <section className="mt-6 rounded-[28px] border border-white/[.08] bg-white/[.035] p-5 backdrop-blur-xl sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[.1em] text-[#34e6cf]">Ekip Toplamı</h2>
          {data.teamGoalStatus?.repCount !== undefined ? <span className="text-[11px] text-[#93a0ad]">{data.teamGoalStatus.repCount} temsilci</span> : null}
        </div>
        {data.teamGoalStatus ? <div className="mt-4"><GoalBarChart rows={[{ name: "Ekip", goalStatus: data.teamGoalStatus }]} /></div>
          : <p className="mt-3 text-sm text-[#8e9aa4]">Bu ay aktif kişisel hedefi olan bir temsilci yok.</p>}
      </section>

      <section className="mt-6 rounded-[28px] border border-white/[.08] bg-white/[.035] p-5 backdrop-blur-xl sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[.1em] text-[#34e6cf]">Temsilci Bazında Performans</h2>
        {data.reps.length === 0 ? (
          <p className="mt-3 text-sm text-[#8e9aa4]">Bu ay aktif kişisel hedefi olan bir temsilci yok.</p>
        ) : (
          <>
            <div className="mt-4"><GoalBarChart rows={data.reps.map((rep) => ({ name: rep.fullName, goalStatus: rep.goalStatus }))} /></div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-white/[.08] text-left text-[10px] uppercase tracking-wider text-[#697681]">
                    <th className="py-2 pr-4">Temsilci</th>
                    <th className="py-2 pr-4">Ziyaret</th>
                    <th className="py-2 pr-4">Satış</th>
                    <th className="py-2 pr-4">Tahsilat</th>
                  </tr>
                </thead>
                <tbody>
                  {data.reps.map((rep) => (
                    <tr className="border-b border-white/[.06]" key={rep.userId}>
                      <td className="py-2.5 pr-4 text-[#dce2e6]">{rep.fullName}</td>
                      <td className="py-2.5 pr-4 text-[#93a0ad]">{rep.goalStatus.visitTarget !== null ? `${rep.goalStatus.visitActual}/${rep.goalStatus.visitTarget}` : "—"}</td>
                      <td className="py-2.5 pr-4 text-[#93a0ad]">{rep.goalStatus.salesTarget !== null ? `${money.format(rep.goalStatus.salesActual)} / ${money.format(rep.goalStatus.salesTarget)}` : "—"}</td>
                      <td className="py-2.5 pr-4 text-[#93a0ad]">{rep.goalStatus.collectionTarget !== null ? `${money.format(rep.goalStatus.collectionActual)} / ${money.format(rep.goalStatus.collectionTarget)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}

// Visit target/actual is a plain count, sales/collection are TL — kept as
// two separate small charts rather than one mixed-unit chart, which would
// misrepresent scale.
function GoalBarChart({ rows }: { rows: { name: string; goalStatus: RepGoalStatus }[] }) {
  const visitRows = rows.filter((row) => row.goalStatus.visitTarget !== null).map((row) => ({ name: row.name, Hedef: row.goalStatus.visitTarget as number, Gerçekleşen: row.goalStatus.visitActual }));
  const moneyRows = rows
    .filter((row) => row.goalStatus.salesTarget !== null || row.goalStatus.collectionTarget !== null)
    .flatMap((row) => [
      ...(row.goalStatus.salesTarget !== null ? [{ name: `${row.name} · Satış`, Hedef: row.goalStatus.salesTarget as number, Gerçekleşen: row.goalStatus.salesActual }] : []),
      ...(row.goalStatus.collectionTarget !== null ? [{ name: `${row.name} · Tahsilat`, Hedef: row.goalStatus.collectionTarget as number, Gerçekleşen: row.goalStatus.collectionActual }] : []),
    ]);

  if (visitRows.length === 0 && moneyRows.length === 0) return <p className="text-sm text-[#8e9aa4]">Grafik için hedef verisi yok.</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {visitRows.length > 0 ? (
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-wider text-[#697681]">Ziyaret (adet)</p>
          <ResponsiveContainer height={220} width="100%">
            <BarChart data={visitRows}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="name" stroke="#697681" tick={{ fontSize: 11 }} />
              <YAxis stroke="#697681" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#0a1821", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="Hedef" fill="#3a4652" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Gerçekleşen" fill="#34e6cf" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      {moneyRows.length > 0 ? (
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-wider text-[#697681]">Satış / Tahsilat (TL)</p>
          <ResponsiveContainer height={220} width="100%">
            <BarChart data={moneyRows}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="name" stroke="#697681" tick={{ fontSize: 11 }} />
              <YAxis stroke="#697681" tick={{ fontSize: 11 }} tickFormatter={(value: number) => value >= 1000 ? `${Math.round(value / 1000)}b` : String(value)} />
              <Tooltip contentStyle={{ background: "#0a1821", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12 }} formatter={(value) => money.format(Number(value))} />
              <Bar dataKey="Hedef" fill="#3a4652" radius={[6, 6, 0, 0]} />
              <Bar dataKey="Gerçekleşen" fill="#7fa4ff" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}

function State({ text }: { text: string }) { return <main className="grid min-h-full place-items-center text-sm text-[#93a0ad]" style={{ background: PAGE_BACKGROUND }}>{text}</main>; }
function EmptyCard({ title, text }: { title: string; text: string }) { return <section className="mt-6 rounded-[28px] border border-white/[.08] bg-white/[.02] p-5 sm:p-6"><h2 className="text-sm font-semibold uppercase tracking-[.1em] text-[#697681]">{title}</h2><p className="mt-3 text-sm text-[#8e9aa4]">{text}</p></section>; }
function Kpi({ label, value, tone }: { label: string; value: string; tone: "cyan" | "blue" | "amber" | "green" }) {
  const colors: Record<string, string> = { cyan: "text-[#34e6cf]", blue: "text-[#7fa4ff]", amber: "text-[#ffb066]", green: "text-[#3ddc97]" };
  return <div className="rounded-[22px] border border-white/[.08] bg-white/[.035] p-4"><p className={`text-2xl font-bold ${colors[tone]}`}>{value}</p><p className="mt-2 text-[11px] font-medium text-[#93a0ad]">{label}</p></div>;
}
