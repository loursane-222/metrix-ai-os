"use client";

import { useCallback, useRef, type ReactNode } from "react";
import { ExecutiveIcon } from "./ExecutiveIcons";
import { ExecutiveHeaderActionsProvider, type ExecutiveHeaderActions } from "./ExecutiveHeaderActionsContext";

// Ported verbatim from the approved metrix-ai-os ExecutiveAppShell (same
// classNames/markup/animation timings). Two deliberate omissions from the
// original, both out of this operation's scope: MetrixNotificationToast
// (notifications) and the pathname-redirect-to-"/" guard (NEXT's canonical
// product route is /metrix, not "/"). LivingWorkspaceHost — the legacy
// directive-runtime/telemetry-coupled host — is replaced by WorkspaceHost,
// a NEXT-native component reproducing the exact same CSS/DOM shell.
export function ExecutiveAppShell({ children }: { children: ReactNode }) {
  const headerActionsRef = useRef<ExecutiveHeaderActions | null>(null);
  const registerHeaderActions = useCallback((actions: ExecutiveHeaderActions) => {
    headerActionsRef.current = actions;
    return () => { if (headerActionsRef.current === actions) headerActionsRef.current = null; };
  }, []);
  return (
    <ExecutiveHeaderActionsProvider register={registerHeaderActions}>
    <div className="executive-app-shell relative flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#030712] text-[#f4f7f8] [color-scheme:dark]">
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex h-[calc(58px+env(safe-area-inset-top))] items-center px-4 pt-[env(safe-area-inset-top)] sm:px-8" data-global-header="conversation">
        <div className="flex w-full items-center justify-between">
          <button aria-label="Sohbet Geçmişi" className="pointer-events-auto grid h-[42px] w-[42px] translate-x-[-2px] translate-y-[17px] place-items-center rounded-full border border-[#99bbe7]/15 bg-[#08101f]/40 text-[#dceaff]/50 transition hover:border-[#75cfff]/35 hover:text-[#dceaff]/80 active:scale-95" onClick={() => headerActionsRef.current?.openHistory()} type="button"><ExecutiveIcon name="menu" className="h-[18px] w-[18px]"/></button>
          <button aria-label="Ayarlar" aria-haspopup="menu" className="pointer-events-auto grid h-[42px] w-[42px] translate-x-[2px] translate-y-[17px] place-items-center rounded-full border border-[#99bbe7]/15 bg-[#08101f]/40 text-[#dceaff]/50 transition hover:border-[#8b76ff]/35 hover:text-[#dceaff]/80 active:scale-95" onClick={() => headerActionsRef.current?.toggleSettings()} type="button"><ExecutiveIcon name="settings" className="h-[18px] w-[18px]"/></button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden pt-[calc(58px+env(safe-area-inset-top))]">
        {children}
      </div>
    </div>
    </ExecutiveHeaderActionsProvider>
  );
}
