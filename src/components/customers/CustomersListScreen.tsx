"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatRelativeDate,
  formatTRY,
  formatTRYCompact,
  listCustomers,
  type CustomerRecord,
  type CustomerStatus,
} from "@/lib/customers/customers-client";
import { CustomersBottomNav } from "./CustomersBottomNav";
import {
  IconDots,
  IconFilter,
  IconPlus,
  IconSearch,
  IconSort,
  IconStar,
  IconTrendUp,
  IconUsers,
  IconWallet,
} from "./icons";
import { Avatar, EmptyState, GlassCard, PAGE_BACKGROUND, StatusPill } from "./ui";

type StatusFilter = "ALL" | CustomerStatus;
type SortKey = "name" | "balance" | "updated";

const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "ALL", label: "Tumu" },
  { id: "ACTIVE", label: "Aktif" },
  { id: "PASSIVE", label: "Pasif" },
  { id: "BLOCKED", label: "Bloke" },
];

const SORT_LABELS: Record<SortKey, string> = {
  name: "Isim",
  balance: "Bakiye",
  updated: "Guncelleme",
};

const STATUS_ACCENT: Record<CustomerStatus, string> = {
  ACTIVE: "#35DCE3",
  PASSIVE: "#7c8894",
  BLOCKED: "#FF5A64",
};

const KPI_TONES = {
  cyan: { fg: "#2ddde3", glow: "rgba(45,221,227,0.22)" },
  blue: { fg: "#4e6fff", glow: "rgba(78,111,255,0.22)" },
  orange: { fg: "#f28b20", glow: "rgba(242,139,32,0.22)" },
  green: { fg: "#6ed05f", glow: "rgba(110,208,95,0.22)" },
} as const;

export function CustomersListScreen() {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("updated");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listCustomers();
    if (res.ok) {
      setCustomers(res.data.customers);
      setLoadError(null);
    } else {
      setLoadError(res.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = customers.filter((c) => {
      const matchesQuery =
        !q ||
        c.displayName.toLowerCase().includes(q) ||
        (c.legalName ?? "").toLowerCase().includes(q) ||
        (c.cariKodu ?? "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "ALL" || c.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
    const sorted = [...rows].sort((a, b) => {
      if (sortKey === "name") return a.displayName.localeCompare(b.displayName, "tr");
      if (sortKey === "balance") return Number(b.balanceCents) - Number(a.balanceCents);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    return sorted;
  }, [customers, query, statusFilter, sortKey]);

  const kpis = useMemo(() => {
    const totalBalance = customers.reduce((sum, c) => sum + Number(c.balanceCents), 0);
    const activeCount = customers.filter((c) => c.status === "ACTIVE").length;
    const avgBalance = customers.length ? totalBalance / customers.length : 0;
    return [
      { label: "Musteri", value: String(customers.length), sublabel: "Guncel toplam", icon: <IconUsers className="h-[13px] w-[13px]" />, tone: "cyan" as const },
      { label: "Bakiye", value: formatTRYCompact(totalBalance), sublabel: "Toplam bakiye", icon: <IconWallet className="h-[13px] w-[13px]" />, tone: "blue" as const },
      { label: "Ortalama", value: formatTRYCompact(avgBalance), sublabel: "Musteri basina", icon: <IconStar className="h-[13px] w-[13px]" />, tone: "orange" as const },
      { label: "Aktif", value: String(activeCount), sublabel: "Aktif kayit", icon: <IconTrendUp className="h-[13px] w-[13px]" />, tone: "green" as const },
    ];
  }, [customers]);

  function cycleSort() {
    setSortKey((prev) => (prev === "updated" ? "name" : prev === "name" ? "balance" : "updated"));
  }

  return (
    <div
      className="relative h-dvh max-h-dvh overflow-hidden text-[#f4f7f8] [color-scheme:dark]"
      style={{ background: PAGE_BACKGROUND }}
    >
      <div
        className="mx-auto flex h-full w-full max-w-[430px] flex-col px-[18px] md:max-w-4xl md:px-8 xl:max-w-5xl xl:px-10"
        style={{ paddingTop: "calc(20px + env(safe-area-inset-top))" }}
      >
        <header className="flex shrink-0 items-start justify-between gap-3">
          <div className="max-w-[185px] md:max-w-md">
            <h1 className="text-[19px] font-bold leading-[1.05] tracking-[-0.02em] text-[rgba(255,255,255,0.96)]">
              Musteriler
            </h1>
            <p className="mt-[7px] text-[10.5px] leading-[1.28] text-[rgba(210,218,224,0.70)]">
              Musteri iliskilerinizi yonetin, buyutme firsatlarini kesfedin.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-[8px]">
            <button
              aria-label="Yeni musteri"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border text-[#062421]"
              onClick={() => router.push("/metrix/customers/new")}
              style={{
                borderColor: "rgba(53,220,227,0.42)",
                background: "linear-gradient(145deg, #4ee7ec, #22c2ca)",
                boxShadow: "0 8px 22px rgba(45,215,224,0.28)",
              }}
              type="button"
            >
              <IconPlus className="h-4 w-4" />
            </button>
            <button
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full border text-white"
              style={{
                borderColor: "rgba(157,180,194,0.16)",
                background: "linear-gradient(145deg, rgba(24,34,42,0.80), rgba(9,16,22,0.92))",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035), 0 8px 22px rgba(0,0,0,0.30)",
              }}
              type="button"
            >
              <IconDots className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        <div className="mt-4 grid shrink-0 grid-cols-4 gap-[6px] md:gap-3">
          {kpis.map((kpi) => {
            const tone = KPI_TONES[kpi.tone];
            return (
              <div
                className="min-w-0 rounded-[13px] px-2.5 pb-3 pt-3 backdrop-blur-md backdrop-saturate-150 md:px-4"
                key={kpi.label}
                style={{
                  background: "linear-gradient(145deg, rgba(27,40,49,0.82) 0%, rgba(8,17,24,0.93) 100%)",
                  border: "1px solid rgba(150,174,189,0.22)",
                  boxShadow:
                    "inset 0 1px 0 rgba(255,255,255,0.035), inset 0 -10px 20px rgba(0,0,0,0.18), 0 8px 18px rgba(0,0,0,0.18)",
                }}
              >
                <span
                  className="grid h-[22px] w-[22px] place-items-center rounded-full"
                  style={{
                    background: `radial-gradient(circle, ${tone.glow}, rgba(255,255,255,0.01) 70%)`,
                    border: `1px solid ${tone.fg}8c`,
                    boxShadow: `0 0 10px ${tone.glow}`,
                    color: tone.fg,
                  }}
                >
                  {kpi.icon}
                </span>
                <p className="mt-2 truncate text-[15px] font-semibold leading-none tracking-[-0.02em] text-[rgba(255,255,255,0.96)]">
                  {kpi.value}
                </p>
                <p className="mt-[4px] truncate text-[8.5px] leading-[1.1] text-[rgba(204,214,220,0.64)]">
                  {kpi.label}
                </p>
                <p className="mt-[3px] truncate text-[7.5px] leading-[1.1] text-[rgba(204,214,220,0.5)]">
                  {kpi.sublabel}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex shrink-0 items-center gap-[6px]">
          <div
            className="flex h-[31px] flex-1 items-center rounded-[8px] backdrop-blur-md"
            style={{ background: "rgba(15,25,33,0.82)", border: "1px solid rgba(145,167,181,0.16)" }}
          >
            {STATUS_FILTERS.map((filter, index) => (
              <button
                className="relative m-[2px] min-h-[27px] flex-1 rounded-[7px] text-[9.5px] transition"
                key={filter.id}
                onClick={() => setStatusFilter(filter.id)}
                style={
                  statusFilter === filter.id
                    ? {
                        background: "linear-gradient(180deg, rgba(22,76,84,0.64), rgba(11,42,48,0.72))",
                        border: "1px solid rgba(62,211,220,0.42)",
                        boxShadow: "inset 0 0 14px rgba(45,215,224,0.11), 0 0 11px rgba(45,215,224,0.09)",
                        color: "#ffffff",
                        fontWeight: 600,
                      }
                    : { color: "rgba(205,214,220,0.64)", fontWeight: 450 }
                }
                type="button"
              >
                {index > 0 && statusFilter !== filter.id && STATUS_FILTERS[index - 1]?.id !== statusFilter ? (
                  <span className="absolute -left-[3px] top-1/2 h-[15px] w-px -translate-y-1/2" style={{ background: "rgba(150,170,181,0.12)" }} />
                ) : null}
                {filter.label}
              </button>
            ))}
          </div>
          <button
            className="grid h-[31px] w-[69px] shrink-0 place-items-center rounded-[8px] backdrop-blur-md"
            style={{
              background: "linear-gradient(145deg, rgba(19,30,38,0.84), rgba(7,15,21,0.90))",
              border: "1px solid rgba(145,169,182,0.18)",
            }}
            type="button"
          >
            <IconFilter className="h-[17px] w-[17px] text-[rgba(211,221,226,0.75)]" />
          </button>
        </div>

        <div className="mt-[10px] flex shrink-0 gap-[6px]">
          <div
            className="flex h-8 flex-1 items-center gap-[10px] rounded-[9px] px-3 backdrop-blur-md"
            style={{
              background: "linear-gradient(145deg, rgba(19,30,38,0.84), rgba(7,15,21,0.90))",
              border: "1px solid rgba(145,169,182,0.18)",
            }}
          >
            <IconSearch className="h-4 w-4 shrink-0 text-[rgba(193,207,215,0.62)]" />
            <input
              className="h-full w-full bg-transparent text-[10px] text-[#f4f7f8] outline-none"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Musteri ara..."
              style={{ color: "rgba(184,197,205,0.9)" }}
              value={query}
            />
          </div>
          <button
            className="flex h-8 shrink-0 items-center gap-[10px] rounded-[9px] px-3 text-[10px] backdrop-blur-md"
            onClick={cycleSort}
            style={{
              background: "linear-gradient(145deg, rgba(19,30,38,0.84), rgba(7,15,21,0.90))",
              border: "1px solid rgba(145,169,182,0.18)",
              color: "rgba(218,226,231,0.76)",
            }}
            type="button"
          >
            <IconSort className="h-[15px] w-[15px]" />
            {SORT_LABELS[sortKey]}
          </button>
        </div>

        {/* Only this region scrolls — header/KPI/filter/search stay pinned, dock is a viewport overlay below. */}
        <div
          className="customers-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
          style={{ scrollPaddingBottom: 96 }}
        >
          <div className="relative mt-4 grid grid-cols-1 gap-1 lg:grid-cols-2 lg:gap-2" style={{ paddingBottom: "calc(96px + env(safe-area-inset-bottom))" }}>
            {filtered.length ? (
              filtered.map((customer) => <CustomerRow customer={customer} key={customer.id} />)
            ) : (
              <GlassCard className="lg:col-span-2">
                <EmptyState
                  description={
                    loadError
                      ? loadError
                      : loading
                        ? "Lutfen bekleyin."
                        : "Filtreleri temizleyin veya yeni bir musteri kaydi olusturun."
                  }
                  title={loadError ? "Musteriler yuklenemedi." : loading ? "Yukleniyor..." : "Sonuc bulunamadi."}
                />
              </GlassCard>
            )}
          </div>
        </div>
      </div>

      <CustomersBottomNav />
    </div>
  );
}

function CustomerRow({ customer }: { customer: CustomerRecord }) {
  const subtitle =
    customer.legalName && customer.legalName !== customer.displayName
      ? customer.legalName
      : customer.cariKodu
        ? `Cari: ${customer.cariKodu}`
        : "Kimlik bilgisi eksik";
  const accent = STATUS_ACCENT[customer.status];

  return (
    <Link className="block py-[2px]" href={`/metrix/customers/${customer.id}`}>
      <div
        className="relative flex min-h-[72px] items-center gap-[11px] overflow-hidden rounded-[11px] pl-[13px] pr-3 backdrop-blur-md backdrop-saturate-150 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#35DCE3]"
        style={{
          background:
            "linear-gradient(105deg, rgba(20,36,45,0.90) 0%, rgba(12,24,32,0.92) 52%, rgba(18,29,36,0.86) 100%)",
          border: "1px solid rgba(151,174,188,0.17)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.025), 0 7px 18px rgba(0,0,0,0.16)",
        }}
      >
        <span
          className="absolute bottom-[7px] left-0 top-[7px] w-[2px] rounded-r-[2px]"
          style={{ background: accent, boxShadow: `0 0 8px ${accent}80` }}
        />

        <span
          className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-full"
          style={{
            border: "1px solid rgba(177,204,215,0.34)",
            background: "radial-gradient(circle at 45% 34%, rgba(33,54,65,0.38), rgba(5,13,18,0.96))",
            boxShadow: "inset 0 0 18px rgba(80,151,168,0.07)",
          }}
        >
          <span
            className="grid h-[38px] w-[38px] place-items-center rounded-full"
            style={{ border: "1px solid rgba(95,139,153,0.28)" }}
          >
            <Avatar name={customer.displayName || "?"} size={34} />
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold leading-[1.15] text-[rgba(255,255,255,0.94)]">
            {customer.displayName || "Isimsiz musteri"}
          </p>
          <p className="mt-[4px] truncate text-[8.5px] leading-none text-[rgba(194,205,212,0.55)]">{subtitle}</p>
          <div className="mt-[6px] flex items-center gap-1.5">
            <StatusPill size="sm" status={customer.status} />
            {customer.tier ? (
              <span
                className="truncate rounded-[3px] px-[7px] text-[8.5px] font-medium leading-[17px]"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(147,160,173,0.9)" }}
              >
                {customer.tier}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex w-[75px] shrink-0 flex-col items-end gap-[6px] text-right">
          <div>
            <p className="text-[7.5px] leading-none" style={{ color: "rgba(188,201,209,0.48)" }}>
              Guncellendi
            </p>
            <p className="mt-[2px] text-[9px] leading-[1.2]" style={{ color: "rgba(219,227,232,0.76)" }}>
              {formatRelativeDate(customer.updatedAt)}
            </p>
          </div>
          <div>
            <p className="text-[7.5px] leading-none" style={{ color: "rgba(188,201,209,0.48)" }}>
              Bakiye
            </p>
            <p className="mt-[1px] truncate text-[10.5px] leading-none" style={{ color: "rgba(229,235,239,0.84)" }}>
              {formatTRY(customer.balanceCents, customer.currency)}
            </p>
          </div>
        </div>

        <svg
          aria-hidden
          className="ml-1 shrink-0"
          fill="none"
          height="14"
          stroke="rgba(223,232,236,0.72)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.6}
          viewBox="0 0 14 14"
          width="14"
        >
          <path d="m5 2.5 4.5 4.5-4.5 4.5" />
        </svg>
      </div>
    </Link>
  );
}
