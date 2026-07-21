import type { ReactNode } from "react";

import { PAGE_BACKGROUND } from "@/components/customers/ui";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main
      className="min-h-[100dvh] overflow-x-hidden text-[#f4f7f8] [color-scheme:dark]"
      style={{ background: PAGE_BACKGROUND }}
    >
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] items-center px-[18px] py-8 sm:max-w-[520px] sm:px-8">
        <div className="w-full rounded-[26px] border border-white/[0.08] bg-white/[0.035] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:p-8">
          <header className="mb-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#34e6cf]">METRIX</p>
            <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.03em] text-[#f4f7f8]">AI Genel Müdürünüz</h1>
            <p className="mt-2 max-w-sm text-sm leading-6 text-[#93a0ad]">Şirketinizi tek bir yönetim ritminde kontrol altında tutun.</p>
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
