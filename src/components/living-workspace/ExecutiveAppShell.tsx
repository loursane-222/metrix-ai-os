"use client";

import { useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";
import { ExecutiveIcon } from "./ExecutiveIcons";
import { ExecutiveHeaderActionsProvider, type ExecutiveHeaderActions } from "./ExecutiveHeaderActionsContext";

const DOCK = [
  ["Şirketim", "/metrix/company", "building"], ["Günlük Ritim", "/metrix/daily-rhythm", "calendar"],
  ["METRIX", "/metrix", "metrix"], ["İş Planı", "/metrix/work-plan", "plan"], ["Diğer", "/metrix/customers", "more"],
] as const;

export function ExecutiveAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const headerActionsRef = useRef<ExecutiveHeaderActions | null>(null);
  const registerHeaderActions = useCallback((actions: ExecutiveHeaderActions) => {
    headerActionsRef.current = actions;
    return () => { if (headerActionsRef.current === actions) headerActionsRef.current = null; };
  }, []);
  return (
    <ExecutiveHeaderActionsProvider register={registerHeaderActions}>
    <div className="executive-app-shell flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#071018] text-[#f4f7f8] [color-scheme:dark]">
      <header className="sticky top-0 z-40 flex h-[calc(58px+env(safe-area-inset-top))] shrink-0 items-end border-b border-white/[.07] bg-[#071018]/92 px-4 pb-1 pt-[env(safe-area-inset-top)] backdrop-blur-xl sm:px-6" data-global-header="conversation">
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
          <button aria-label="Sohbet Geçmişi" className="grid h-11 w-11 place-items-center rounded-full border border-white/[.08] bg-white/[.04] text-[#c9d1d6]" onClick={() => headerActionsRef.current?.openHistory()} type="button"><ExecutiveIcon name="back" className="h-4 w-4"/></button>
          <Link aria-label="METRIX" className="text-sm font-black tracking-[.2em]" data-global-wordmark="METRIX" href="/metrix">METRIX</Link>
          <button aria-label="Ayarlar" aria-haspopup="menu" className="ml-auto grid h-11 w-11 place-items-center rounded-full border border-white/[.08] bg-white/[.04] text-[#c9d1d6]" onClick={() => headerActionsRef.current?.toggleSettings()} type="button"><ExecutiveIcon name="user" className="h-4 w-4"/></button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden pb-[calc(78px+env(safe-area-inset-bottom))]">
        {pathname === "/metrix" ? <LivingWorkspaceHost conversation={children}/> : <div className="h-full min-h-0 overflow-y-auto overscroll-contain">{children}</div>}
      </div>
      <ExecutiveDock pathname={pathname}/>
    </div>
    </ExecutiveHeaderActionsProvider>
  );
}

function ExecutiveDock({ pathname }: { pathname: string }) {
  return <nav aria-label="Executive Dock" className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(10px,env(safe-area-inset-bottom))]">
    <div className="mx-auto grid h-16 max-w-[520px] grid-cols-5 rounded-[24px] border border-white/[.12] bg-[#0b161f]/90 px-2 shadow-[0_18px_50px_rgba(0,0,0,.5)] backdrop-blur-2xl">
      {DOCK.map(([label, href, icon]) => { const active = href === "/metrix" ? pathname === href : pathname.startsWith(href); return <Link aria-current={active ? "page" : undefined} className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl text-[9px] font-semibold transition ${active ? "text-[#35dce3]" : "text-[#75838d]"}`} href={href} key={href}><ExecutiveIcon name={icon} className="h-[18px] w-[18px]"/><span className="truncate">{label}</span></Link>; })}
    </div>
  </nav>;
}
