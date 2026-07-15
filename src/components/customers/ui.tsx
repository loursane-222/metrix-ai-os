"use client";

import type { ReactNode } from "react";
import { avatarHueFor, initialsFor, type CustomerStatus, statusLabel } from "@/lib/customers/customers-client";
import { IconLock } from "./icons";

export const PAGE_BACKGROUND =
  "radial-gradient(circle at 50% 18%, rgba(21,45,57,0.32) 0%, rgba(7,16,23,0.13) 28%, transparent 55%), " +
  "radial-gradient(circle at 3% 52%, rgba(17,90,105,0.09), transparent 32%), " +
  "linear-gradient(180deg, #061018 0%, #07121a 42%, #040b11 100%)";

// Same viewport-fixed + inner-scroll primitive as CustomersListScreen: the
// outer shell never scrolls, only the region below `header` does, so the
// dock (rendered by the screen, fixed to the viewport) never covers content.
export function PageShell({ header, children }: { header?: ReactNode; children: ReactNode }) {
  return (
    <div
      className="relative h-dvh max-h-dvh overflow-hidden text-[#f4f7f8] [color-scheme:dark]"
      style={{ background: PAGE_BACKGROUND }}
    >
      <div
        className="mx-auto flex h-full w-full max-w-[430px] flex-col px-[18px]"
        style={{ paddingTop: "calc(20px + env(safe-area-inset-top))" }}
      >
        {header ? <div className="shrink-0">{header}</div> : null}
        <div className="customers-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
          <div style={{ paddingBottom: "calc(96px + env(safe-area-inset-bottom))" }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

export function GlassCard({
  children,
  className = "",
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <section
      className={`rounded-[26px] border bg-white/[0.035] backdrop-blur-xl ${
        glow ? "border-[#34e6cf]/25 shadow-[0_0_0_1px_rgba(52,230,207,0.06),0_20px_60px_rgba(0,0,0,0.35)]" : "border-white/[0.08]"
      } ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-[15px] font-semibold text-[#f4f7f8]">{children}</h3>
      {action}
    </div>
  );
}

export function Avatar({ name, size = 56 }: { name: string; size?: number }) {
  const hue = avatarHueFor(name || "?");
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full border font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.32,
        color: `hsl(${hue} 85% 72%)`,
        background: `hsl(${hue} 55% 16%)`,
        borderColor: `hsl(${hue} 60% 40% / 0.4)`,
      }}
    >
      {initialsFor(name || "?")}
    </div>
  );
}

export function StatusPill({ status, size = "md" }: { status: CustomerStatus; size?: "md" | "sm" }) {
  const tone =
    status === "ACTIVE"
      ? "bg-[#123b2c] text-[#3ddc97] border-[#3ddc97]/25"
      : status === "BLOCKED"
        ? "bg-[#3b1420] text-[#f16a7a] border-[#f16a7a]/25"
        : "bg-white/[0.06] text-[#93a0ad] border-white/10";
  if (size === "sm") {
    return (
      <span
        className={`inline-flex h-[17px] items-center gap-1 rounded-[3px] border px-[7px] text-[8.5px] font-semibold leading-none ${tone}`}
      >
        <span className="h-1 w-1 rounded-full bg-current" />
        {statusLabel(status)}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {statusLabel(status)}
    </span>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${
        tone === "accent"
          ? "border-[#34e6cf]/25 bg-[#34e6cf]/10 text-[#34e6cf]"
          : "border-white/10 bg-white/[0.05] text-[#93a0ad]"
      }`}
    >
      {children}
    </span>
  );
}

const KPI_TONES = {
  neutral: "bg-white/[0.05] border-white/10 text-[#6f7a87]",
  cyan: "bg-[#34e6cf]/[0.12] border-[#34e6cf]/25 text-[#34e6cf]",
  blue: "bg-[#5b8fff]/[0.12] border-[#5b8fff]/25 text-[#7fa4ff]",
  orange: "bg-[#ff9f43]/[0.12] border-[#ff9f43]/25 text-[#ffb066]",
  green: "bg-[#3ddc97]/[0.12] border-[#3ddc97]/25 text-[#3ddc97]",
} as const;

export function KpiTile({
  icon,
  label,
  value,
  sublabel,
  disabled = false,
  tone = "neutral",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sublabel?: string;
  disabled?: boolean;
  tone?: keyof typeof KPI_TONES;
}) {
  return (
    <div
      className={`min-w-0 shrink-0 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 ${
        disabled ? "opacity-55" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`grid h-8 w-8 place-items-center rounded-full border ${KPI_TONES[tone]}`}>{icon}</span>
        {disabled ? <IconLock className="h-3.5 w-3.5 text-[#5c6673]" /> : null}
      </div>
      <p className="mt-2.5 truncate text-[17px] font-bold leading-none text-[#f4f7f8]">{value}</p>
      <p className="mt-1.5 min-h-[24px] text-[10px] font-semibold leading-tight text-[#93a0ad]">{label}</p>
      {sublabel ? <p className="mt-0.5 truncate text-[9px] leading-tight text-[#5c6673]">{sublabel}</p> : null}
    </div>
  );
}

export function DisabledPanel({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.05] text-[#6f7a87]">
        <IconLock className="h-[18px] w-[18px]" />
      </span>
      <p className="text-sm font-semibold text-[#93a0ad]">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed text-[#5c6673]">{note}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <p className="text-sm font-semibold text-[#93a0ad]">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed text-[#5c6673]">{description}</p>
      {actionLabel && onAction ? (
        <button
          className="mt-1 rounded-xl bg-[#34e6cf] px-4 py-2 text-xs font-bold text-[#062421]"
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function FieldRow({
  icon,
  label,
  value,
  badge,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  badge?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-[#6f7a87]">
        {icon}
      </span>
      <span className="w-[110px] shrink-0 text-xs text-[#6f7a87]">{label}</span>
      <span className="flex-1 truncate text-sm font-medium text-[#e3e8eb]">{value}</span>
      {badge}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      className="rounded-xl bg-[#34e6cf] px-4 py-2.5 text-sm font-bold text-[#062421] transition disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-[#e3e8eb] transition disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
