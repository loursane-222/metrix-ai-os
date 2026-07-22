import type { ReactNode } from "react";

import { PAGE_BACKGROUND } from "@/components/customers/ui";

export function AuthShell({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return (
    <main
      className="min-h-[100dvh] overflow-x-hidden text-[#f4f7f8] [color-scheme:dark]"
      style={{ background: PAGE_BACKGROUND }}
    >
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[520px] flex-col justify-center px-[18px] py-[max(24px,env(safe-area-inset-top))] sm:px-8">
        <header className={`shrink-0 text-center ${compact ? "mb-6" : "mb-[clamp(24px,5vh,52px)]"}`}>
          {!compact ? (
            <div aria-hidden="true" className="relative mx-auto mb-6 grid h-[clamp(150px,25vh,260px)] w-full place-items-center overflow-hidden rounded-[28px] border border-[#34e6cf]/15 bg-[radial-gradient(circle_at_50%_45%,rgba(52,230,207,.2),transparent_48%),linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.015))] shadow-[0_24px_80px_rgba(0,0,0,.42)]">
              {/* Same retina visual authority used by ExecutivePresenceOrb. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" className="h-[clamp(132px,22vh,230px)] w-[clamp(132px,22vh,230px)] object-contain drop-shadow-[0_0_48px_rgba(52,230,207,.28)]" draggable={false} height="600" src="/design/executive-presence-orb.png" width="600" />
            </div>
          ) : null}
          <p className="text-[clamp(38px,8vw,72px)] font-black leading-none tracking-[0.16em] text-[#f4f7f8] [text-shadow:0_0_42px_rgba(52,230,207,0.16)]">METRIX</p>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.32em] text-[#34e6cf]">AI EXECUTIVE OS</p>
          {!compact ? <p className="mx-auto mt-5 max-w-md text-[clamp(17px,2.4vh,22px)] font-medium leading-snug tracking-[-0.02em] text-[#e3e8eb]">Bugünden itibaren şirketinizin yanında bir AI Genel Müdür var.</p> : null}
        </header>
        <div className="w-full rounded-[28px] border border-white/[0.09] bg-white/[0.045] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:p-8">
          <header className="mb-8">
            <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-[#f4f7f8]">Güvenli giriş</h1>
            <p className="mt-2 max-w-sm text-sm leading-6 text-[#93a0ad]">E-posta adresinizle güvenli biçimde giriş yapın veya hesabınızı oluşturun.</p>
          </header>
          {children}
        </div>
      </div>
    </main>
  );
}

export const authInputClass =
  "mt-2 h-12 w-full rounded-xl border border-white/[0.12] bg-[#07121a]/80 px-4 text-base text-[#f4f7f8] outline-none transition placeholder:text-[#5c6673] focus:border-[#34e6cf]/70 focus:ring-4 focus:ring-[#34e6cf]/10 disabled:cursor-not-allowed disabled:opacity-50";

export const authButtonClass =
  "mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-[#34e6cf] px-5 text-sm font-bold text-[#062421] transition hover:bg-[#51ead6] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#34e6cf]/25 disabled:cursor-not-allowed disabled:opacity-40";
