import { IconChart, IconFactory, IconFileText, IconPackage, IconTasks, IconTruck, IconUsers, IconWallet } from "@/components/customers/icons";
import type { ReactNode } from "react";

type VisualIcon = "tasks" | "reports" | "orders" | "customers" | "finance" | "offers" | "deliveries" | "production";
type VisualDomain = { key: string; label: string; className: string; icon: VisualIcon };

const VISUAL_DOMAINS: readonly VisualDomain[] = [
  { key: "task", label: "Görevler", icon: "tasks", className: "metrix-domain-tasks" },
  { key: "report", label: "Raporlar", icon: "reports", className: "metrix-domain-reports" },
  { key: "order", label: "Siparişler", icon: "orders", className: "metrix-domain-orders" },
  { key: "customer", label: "Müşteriler", icon: "customers", className: "metrix-domain-customers" },
  { key: "finance", label: "Finans", icon: "finance", className: "metrix-domain-finance" },
  { key: "offer", label: "Teklifler", icon: "offers", className: "metrix-domain-offers" },
  { key: "delivery", label: "Teslimatlar", icon: "deliveries", className: "metrix-domain-deliveries" },
  { key: "production", label: "Üretim", icon: "production", className: "metrix-domain-production" },
];

function DomainGlyph({ icon }: { icon: VisualIcon }) {
  const className = "metrix-domain-svg";
  const glyphs = {
    tasks: <IconTasks className={className} />,
    reports: <IconChart className={className} />,
    orders: <IconPackage className={className} />,
    customers: <IconUsers className={className} />,
    finance: <IconWallet className={className} />,
    offers: <IconFileText className={className} />,
    deliveries: <IconTruck className={className} />,
    production: <IconFactory className={className} />,
  } satisfies Record<VisualIcon, ReactNode>;
  return <span className={`metrix-domain-icon-shell metrix-domain-icon-${icon}`}>{glyphs[icon]}</span>;
}

/** Presentation-only projection; authoritative state is supplied by the existing runtime. */
export function MetrixEcosystemField({ activeDomain }: { activeDomain?: string | null }) {
  const traces = Array.from({ length: 25 }, (_, index) => index);
  return (
    <section aria-hidden="true" className="metrix-ecosystem-field" data-active-domain={activeDomain ?? "neutral"}>
      <svg className="metrix-network metrix-network-desktop" viewBox="0 0 1160 540">
        <defs>
          <linearGradient id="routeBlue" x1="0" x2="1"><stop stopColor="#24598c" stopOpacity="0"/><stop offset=".48" stopColor="#4acaff"/><stop offset="1" stopColor="#25598c" stopOpacity="0"/></linearGradient>
          <linearGradient id="routeViolet" x1="0" x2="1"><stop stopColor="#365bc1" stopOpacity="0"/><stop offset=".52" stopColor="#7457f0"/><stop offset="1" stopColor="#bb35ce" stopOpacity="0"/></linearGradient>
          <filter id="routeGlow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <g className="metrix-primary-routes">
          <path d="M62 288H336c54 0 62-78 126-78h30" data-route-domain="customer" />
          <path d="M104 216h120c54 0 62-66 126-66h142" data-route-domain="report" />
          <path d="M116 348h112c50 0 62 104 122 104h128" data-route-domain="offer" />
          <path d="M1098 288H824c-54 0-62-78-126-78h-30" data-route-domain="finance" />
          <path d="M1056 216H936c-54 0-62-66-126-66H668" data-route-domain="order" />
          <path d="M1044 348H932c-50 0-62 104-122 104H682" data-route-domain="delivery" />
        </g>
        <g className="metrix-trace-bank">
          {traces.map((index) => { const y = 246 + index * 4.1; const bend = 398 + (index % 6) * 9; return <path d={`M${80 + (index % 5) * 18} ${y}H${bend}Q${bend + 30} ${y} ${bend + 48} ${270 + index * 1.9}H510`} key={`l-${index}`} />; })}
          {traces.map((index) => { const y = 246 + index * 4.1; const bend = 762 - (index % 6) * 9; return <path d={`M${1080 - (index % 5) * 18} ${y}H${bend}Q${bend - 30} ${y} ${bend - 48} ${270 + index * 1.9}H650`} key={`r-${index}`} />; })}
        </g>
        <g className="metrix-micro-traces">
          <path d="M126 236h112l36 23h102"/><path d="M72 333h160l28-18h116"/><path d="M166 381h126l35-23h77"/>
          <path d="M1034 236H922l-36 23H784"/><path d="M1088 333H928l-28-18H784"/><path d="M994 381H868l-35-23h-77"/>
          <circle cx="273" cy="289" r="2.6"/><circle cx="383" cy="340" r="2.2"/><circle cx="890" cy="289" r="2.6"/><circle cx="778" cy="340" r="2.2"/>
          <rect x="344" y="227" width="8" height="8" rx="2"/><rect x="805" y="227" width="8" height="8" rx="2"/>
        </g>
      </svg>
      <svg className="metrix-network metrix-network-mobile" preserveAspectRatio="none" viewBox="0 0 390 430">
        <defs>
          <linearGradient id="mobileRouteBlue" x1="0" x2="1"><stop stopColor="#24598c" stopOpacity=".08"/><stop offset=".5" stopColor="#4acaff"/><stop offset="1" stopColor="#24598c" stopOpacity=".08"/></linearGradient>
          <linearGradient id="mobileRouteViolet" x1="0" x2="1"><stop stopColor="#4939a9" stopOpacity=".08"/><stop offset=".5" stopColor="#7655e8"/><stop offset="1" stopColor="#9d32b9" stopOpacity=".08"/></linearGradient>
        </defs>
        <g className="metrix-mobile-primary-routes">
          <path d="M18 111H103Q128 111 142 143L154 166" data-route-domain="task"/>
          <path d="M108 72h30q28 0 41 62l3 24" data-route-domain="report"/>
          <path d="M372 111h-85q-25 0-39 32l-12 23" data-route-domain="order"/>
          <path d="M8 215h118q20 0 32-13" data-route-domain="customer"/>
          <path d="M382 215H264q-20 0-32-13" data-route-domain="finance"/>
          <path d="M24 334h87q27 0 45-73" data-route-domain="offer"/>
          <path d="M195 375v-91" data-route-domain="production"/>
          <path d="M366 334h-87q-27 0-45-73" data-route-domain="delivery"/>
        </g>
        <g className="metrix-mobile-traces">
          <path d="M12 181h115q17 0 28 10"/><path d="M5 189h132q13 0 21 7"/><path d="M0 197h148l11 4"/><path d="M0 205h158"/>
          <path d="M378 181H263q-17 0-28 10"/><path d="M385 189H253q-13 0-21 7"/><path d="M390 197H242l-11 4"/><path d="M390 205H232"/>
          <path d="M36 281h72l36-39"/><path d="M354 281h-72l-36-39"/><path d="M82 303h48l20-47"/><path d="M308 303h-48l-20-47"/>
          <circle cx="79" cy="197" r="2"/><circle cx="311" cy="197" r="2"/><circle cx="129" cy="281" r="2"/><circle cx="261" cy="281" r="2"/>
        </g>
      </svg>
      <div className="metrix-hub"><span className="metrix-hub-mark"><i /><i /><i /><i /></span><strong>METRIX</strong></div>
      {VISUAL_DOMAINS.map((domain) => <div className={`metrix-domain-node ${domain.className}`} data-domain={domain.key} key={`${domain.label}-${domain.className}`}><DomainGlyph icon={domain.icon} /><span className="metrix-domain-label">{domain.label}</span></div>)}
    </section>
  );
}
