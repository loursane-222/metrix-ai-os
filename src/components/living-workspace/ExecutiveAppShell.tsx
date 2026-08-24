"use client";

import { useCallback, useRef } from "react";
import { redirect, usePathname } from "next/navigation";
import { LivingWorkspaceHost } from "./LivingWorkspaceHost";
import { ExecutiveIcon } from "./ExecutiveIcons";
import { ExecutiveHeaderActionsProvider, type ExecutiveHeaderActions } from "./ExecutiveHeaderActionsContext";
import { MetrixNotificationToast } from "./MetrixNotificationToast";

export function ExecutiveAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const headerActionsRef = useRef<ExecutiveHeaderActions | null>(null);
  const registerHeaderActions = useCallback((actions: ExecutiveHeaderActions) => {
    headerActionsRef.current = actions;
    return () => { if (headerActionsRef.current === actions) headerActionsRef.current = null; };
  }, []);
  if (pathname !== "/") redirect("/");
  return (
    <ExecutiveHeaderActionsProvider register={registerHeaderActions}>
    <div className="executive-app-shell relative flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#030712] text-[#f4f7f8] [color-scheme:dark]">
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex h-[calc(58px+env(safe-area-inset-top))] items-center px-4 pt-[env(safe-area-inset-top)] sm:px-8" data-global-header="conversation">
        <div className="flex w-full items-center justify-between">
          <button aria-label="Sohbet Geçmişi" className="pointer-events-auto grid h-[42px] w-[42px] translate-x-[-2px] translate-y-[17px] place-items-center rounded-full border border-[#99bbe7]/15 bg-[#08101f]/40 text-[#dceaff]/50 transition hover:border-[#75cfff]/35 hover:text-[#dceaff]/80 active:scale-95" onClick={() => headerActionsRef.current?.openHistory()} type="button"><ExecutiveIcon name="menu" className="h-[18px] w-[18px]"/></button>
          <button aria-label="Ayarlar" aria-haspopup="menu" className="pointer-events-auto grid h-[42px] w-[42px] translate-x-[2px] translate-y-[17px] place-items-center rounded-full border border-[#99bbe7]/15 bg-[#08101f]/40 text-[#dceaff]/50 transition hover:border-[#8b76ff]/35 hover:text-[#dceaff]/80 active:scale-95" onClick={() => headerActionsRef.current?.toggleSettings()} type="button"><ExecutiveIcon name="settings" className="h-[18px] w-[18px]"/></button>
        </div>
      </header>
      <MetrixNotificationToast />
      <div className="min-h-0 flex-1 overflow-hidden pt-[calc(58px+env(safe-area-inset-top))]">
        <LivingWorkspaceHost conversation={children}/>
      </div>
    </div>
    </ExecutiveHeaderActionsProvider>
  );
}
