"use client";

import { useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";
import { ExecutiveIcon } from "./ExecutiveIcons";
import { ExecutiveHeaderActionsProvider, type ExecutiveHeaderActions } from "./ExecutiveHeaderActionsContext";

export function ExecutiveAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const headerActionsRef = useRef<ExecutiveHeaderActions | null>(null);
  const registerHeaderActions = useCallback((actions: ExecutiveHeaderActions) => {
    headerActionsRef.current = actions;
    return () => { if (headerActionsRef.current === actions) headerActionsRef.current = null; };
  }, []);
  return (
    <ExecutiveHeaderActionsProvider register={registerHeaderActions}>
    <div className="executive-app-shell relative flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#14120F] text-[#f4f7f8] [color-scheme:dark]">
      <header className="fixed inset-x-0 top-0 z-40 flex h-[calc(58px+env(safe-area-inset-top))] items-center border-b border-[#C9BFA8]/15 bg-[#14120F] px-4 pt-[env(safe-area-inset-top)] shadow-[0_8px_24px_rgba(0,0,0,.22)] sm:px-6" data-global-header="conversation">
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
          <button aria-label="Sohbet Geçmişi" className="grid h-11 w-11 place-items-center rounded-full border border-[#C9BFA8]/25 bg-[#1C1914] text-[#EDE7D9] shadow-[inset_0_1px_0_rgba(255,255,255,.06)] transition hover:border-[#C9BFA8]/45 hover:bg-[#1C1914] active:scale-95" onClick={() => headerActionsRef.current?.openHistory()} type="button"><ExecutiveIcon name="menu" className="h-[18px] w-[18px]"/></button>
          <Link aria-label="METRIX" className="text-[15px] font-black tracking-[.34em] text-[#EDE7D9] transition-opacity [text-shadow:0_0_18px_rgba(53,220,227,.22)] hover:opacity-85" data-global-wordmark="METRIX" href="/">METRIX</Link>
          <button aria-label="Ayarlar" aria-haspopup="menu" className="ml-auto grid h-11 w-11 place-items-center rounded-full border border-[#C9BFA8]/25 bg-[#1C1914] text-[#EDE7D9] shadow-[inset_0_1px_0_rgba(255,255,255,.06)] transition hover:border-[#C9BFA8]/45 hover:bg-[#1C1914] active:scale-95" onClick={() => headerActionsRef.current?.toggleSettings()} type="button"><ExecutiveIcon name="settings" className="h-[18px] w-[18px]"/></button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden pt-[calc(58px+env(safe-area-inset-top))]">
        {pathname === "/" ? <LivingWorkspaceHost conversation={children}/> : <div className="h-full min-h-0 overflow-y-auto overscroll-contain">{children}</div>}
      </div>
    </div>
    </ExecutiveHeaderActionsProvider>
  );
}
