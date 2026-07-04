"use client";

import { useState } from "react";
import { MetrixChatTab } from "@/components/metrix-tab/MetrixChatTab";

// ─── Types ───────────────────────────────────────────────────────────────────

type TabId = "sirketim" | "gunluk-ritim" | "metrix" | "is-plani";

type ApiResponse<T> =
  | { ok: true; data: T; status?: number }
  | { ok: false; error: { message: string }; status?: number };

// ─── API helper (passed to MetrixChatTab) ────────────────────────────────────

async function tabApiPost<T = unknown>(
  path: string,
  body: Record<string, unknown>,
): Promise<ApiResponse<T>> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  return res.json() as Promise<ApiResponse<T>>;
}

// ─── Tab definitions ─────────────────────────────────────────────────────────

const TABS: Array<{
  id: TabId;
  label: string;
  icon: (active: boolean) => React.ReactNode;
}> = [
  { id: "sirketim", label: "Şirketim", icon: (a) => <SvgNavBuilding active={a} /> },
  { id: "gunluk-ritim", label: "Günlük Ritim", icon: (a) => <SvgNavCalendar active={a} /> },
  { id: "metrix", label: "METRIX", icon: (a) => <SvgNavMetrix active={a} /> },
  { id: "is-plani", label: "İş Planı", icon: (a) => <SvgNavPlan active={a} /> },
];

// ─── Main Screen ─────────────────────────────────────────────────────────────

export function MetrixTabScreen() {
  const [active, setActive] = useState<TabId>("metrix");

  return (
    <div className="relative flex h-full flex-col bg-[#faf8f3]">
      {/* ── Tab content ─── fills all space between top and bottom nav */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {active === "metrix" ? (
          <MetrixChatTab apiPost={tabApiPost} />
        ) : (
          <PlaceholderTab label={TABS.find((t) => t.id === active)?.label ?? ""} />
        )}
      </div>

      {/* ── Bottom navigation ─── always visible */}
      <MetrixBottomNav active={active} onTabChange={setActive} />
    </div>
  );
}

// ─── Placeholder for tabs not yet built ──────────────────────────────────────

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-[#faf8f3]">
      <p className="text-[14px] font-semibold text-[#c8bdb0]">{label} — Yakında</p>
    </div>
  );
}

// ─── Bottom Navigation ────────────────────────────────────────────────────────

function MetrixBottomNav({
  active,
  onTabChange,
}: {
  active: TabId;
  onTabChange: (id: TabId) => void;
}) {
  return (
    <nav
      className="shrink-0 border-t border-[#ece5d8] bg-[#faf8f3]"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
    >
      <div className="grid grid-cols-4">
        {TABS.map(({ id, label, icon }) => {
          const isActive = active === id;
          const isMetrix = id === "metrix";
          return (
            <button
              className="flex flex-col items-center gap-0.5 pt-2"
              key={id}
              onClick={() => onTabChange(id)}
              type="button"
            >
              <span
                className={`flex h-8 items-center justify-center rounded-full px-3 transition ${
                  isMetrix && isActive ? "bg-[#efe6d6]" : ""
                }`}
              >
                {icon(isActive)}
              </span>
              <span
                className={`pb-1 text-[10px] font-bold transition ${
                  isActive ? "text-[#8a5a2b]" : "text-[#c0b098]"
                } ${isMetrix && isActive ? "font-black" : ""}`}
              >
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ─── SVG Nav Icons ────────────────────────────────────────────────────────────

function SvgNavBuilding({ active }: { active: boolean }) {
  const c = active ? "#8a5a2b" : "#c0b098";
  const w = active ? "2" : "1.6";
  return (
    <svg fill="none" height="22" stroke={c} strokeLinecap="round" strokeLinejoin="round" strokeWidth={w} viewBox="0 0 24 24" width="22">
      <rect height="17" rx="1.5" width="14" x="5" y="6" />
      <path d="M9 10h2M13 10h2M9 14h2M13 14h2M9 18h2M13 18h2M5 10h14" />
    </svg>
  );
}

function SvgNavCalendar({ active }: { active: boolean }) {
  const c = active ? "#8a5a2b" : "#c0b098";
  const w = active ? "2" : "1.6";
  return (
    <svg fill="none" height="22" stroke={c} strokeLinecap="round" strokeLinejoin="round" strokeWidth={w} viewBox="0 0 24 24" width="22">
      <rect height="16" rx="2" width="16" x="4" y="5" />
      <path d="M8 3v4M16 3v4M4 11h16" />
      <circle cx="8.5" cy="15.5" fill={c} r="1.2" stroke="none" />
      <circle cx="12" cy="15.5" fill={c} r="1.2" stroke="none" />
    </svg>
  );
}

function SvgNavMetrix({ active }: { active: boolean }) {
  const c = active ? "#8a5a2b" : "#c0b098";
  return (
    <svg fill="none" height="22" viewBox="0 0 24 24" width="22">
      <rect fill={c} height="9" rx="1.5" width="3.5" x="2" y="13" />
      <rect fill={c} height="13" rx="1.5" width="3.5" x="7" y="9" opacity={active ? 1 : 0.65} />
      <rect fill={c} height="17" rx="1.5" width="3.5" x="12" y="5" opacity={active ? 1 : 0.45} />
      <rect fill={c} height="7" rx="1.5" width="3.5" x="17" y="15" opacity={active ? 1 : 0.55} />
    </svg>
  );
}

function SvgNavPlan({ active }: { active: boolean }) {
  const c = active ? "#8a5a2b" : "#c0b098";
  const w = active ? "2" : "1.6";
  return (
    <svg fill="none" height="22" stroke={c} strokeLinecap="round" strokeLinejoin="round" strokeWidth={w} viewBox="0 0 24 24" width="22">
      <rect height="16" rx="2" width="14" x="5" y="5" />
      <path d="M9 10h6M9 14h4" />
      <path d="M8 3v4M16 3v4" />
    </svg>
  );
}
