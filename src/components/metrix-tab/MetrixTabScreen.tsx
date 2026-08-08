"use client";

import { MetrixChatTab } from "@/components/metrix-tab/MetrixChatTab";
import { AtmosphereAssessmentProvider } from "@/components/living-workspace/AtmosphereAssessmentContext";
import { PAGE_BACKGROUND } from "@/components/customers/ui";

type ApiResponse<T> =
  | { ok: true; data: T; status?: number }
  | { ok: false; error: { message: string }; status?: number };

async function tabApiPost<T = unknown>(path: string, body: Record<string, unknown>): Promise<ApiResponse<T>> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  return res.json() as Promise<ApiResponse<T>>;
}

/** Compatibility conversation wrapper. Shell/header/dock ownership lives in ExecutiveAppShell. */
export function MetrixTabScreen() {
  return <AtmosphereAssessmentProvider><div className="relative h-full min-h-0 overflow-hidden text-[#f4f7f8]" style={{ background: PAGE_BACKGROUND }}><MetrixChatTab apiPost={tabApiPost}/></div></AtmosphereAssessmentProvider>;
}
