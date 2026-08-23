"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dispatchConversationNavigation } from "@/lib/conversation-extensions/conversation-navigation-runtime";

type ToastNotification = { id: string; title: string; body: string | null; entityType: string | null; entityId: string | null };
const ROUTES: Record<string, (id: string) => string> = {
  Customer: (id) => `/metrix/customers/${encodeURIComponent(id)}`,
  Task: (id) => `/metrix/tasks/${encodeURIComponent(id)}`,
  Quote: (id) => `/metrix/offers/${encodeURIComponent(id)}/edit`,
  Payment: () => "/metrix/collections",
  Invoice: () => "/metrix/invoices",
  CalendarEvent: () => "/metrix/calendar",
};
const AUTHORITIES: Record<string, string> = { Customer: "customers.detail.page", Task: "workspace.task.page", Quote: "offers.edit.page", Payment: "workspace.payment.page", Invoice: "workspace.invoice.page", CalendarEvent: "calendar.events.page" };

let chimeContext: AudioContext | null = null;

// Bell-like note: fundamental sine + a soft octave-up triangle overtone for shimmer.
function playChimeNote(ctx: AudioContext, startTime: number, freq: number, duration: number, gainLevel: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainLevel, startTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.02);

  const overtone = ctx.createOscillator();
  const overtoneGain = ctx.createGain();
  overtone.type = "triangle";
  overtone.frequency.setValueAtTime(freq * 2, startTime);
  overtoneGain.gain.setValueAtTime(0, startTime);
  overtoneGain.gain.linearRampToValueAtTime(gainLevel * 0.33, startTime + 0.008);
  overtoneGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration * 0.7);
  overtone.connect(overtoneGain);
  overtoneGain.connect(ctx.destination);
  overtone.start(startTime);
  overtone.stop(startTime + duration + 0.02);
}

// METRIX signature chime — C6 → G6 → E6 → C6 (sustained tail), a melodic ping-and-echo motif.
function playNotificationChime() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    chimeContext ??= new Ctor();
    if (chimeContext.state === "suspended") void chimeContext.resume();
    const ctx = chimeContext;
    const t = ctx.currentTime + 0.02;
    playChimeNote(ctx, t, 1046.5, 0.22, 0.15);
    playChimeNote(ctx, t + 0.1, 1568.0, 0.24, 0.14);
    playChimeNote(ctx, t + 0.2, 1318.51, 0.28, 0.13);
    playChimeNote(ctx, t + 0.32, 1046.5, 0.55, 0.16);
  } catch {
    // Audio is a non-essential enhancement — never let it break the toast.
  }
}

export function MetrixNotificationToast() {
  const [active, setActive] = useState<ToastNotification | null>(null);
  const [visible, setVisible] = useState(false);
  const seen = useRef(new Set<string>());
  const queue = useRef<ToastNotification[]>([]);
  const activeRef = useRef(false);
  const showNext = useCallback(() => {
    if (activeRef.current || !queue.current.length) return;
    activeRef.current = true;
    setActive(queue.current.shift()!);
    requestAnimationFrame(() => setVisible(true));
    window.setTimeout(() => setVisible(false), 6500);
    window.setTimeout(() => { setActive(null); activeRef.current = false; showNext(); }, 6900);
  }, []);
  const poll = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications?unreadOnly=true", { credentials: "include" });
      if (!response.ok) return;
      const payload = await response.json() as { data?: { notifications?: ToastNotification[] } };
      const rows = payload.data?.notifications ?? [];
      if (seen.current.size === 0) { rows.forEach((row) => seen.current.add(row.id)); return; }
      const fresh = rows.filter((row) => !seen.current.has(row.id)).reverse();
      if (fresh.length > 0) playNotificationChime();
      fresh.forEach((row) => { seen.current.add(row.id); queue.current.push(row); });
      showNext();
    } catch (error: unknown) {
      console.error("[MetrixNotificationToast] notification poll failed", {
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }, [showNext]);
  useEffect(() => {
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => window.clearInterval(timer);
  }, [poll]);
  if (!active) return null;
  const open = async () => {
    await fetch(`/api/notifications/${active.id}/read`, { method: "POST", credentials: "include" });
    const routeFactory = active.entityType ? ROUTES[active.entityType] : undefined;
    if (routeFactory && active.entityId && active.entityType) void dispatchConversationNavigation({ route: routeFactory(active.entityId), source: "written", correlationId: crypto.randomUUID(), expectedSurfaceAuthorityKey: AUTHORITIES[active.entityType] });
    setVisible(false);
  };
  return <button aria-label={`${active.title} bildirimini aç`} className={`fixed left-1/2 top-[calc(66px+env(safe-area-inset-top))] z-[70] flex w-[min(92vw,430px)] -translate-x-1/2 items-center gap-3 rounded-[22px] border border-[#E4D6B6]/20 bg-[#201C16]/95 p-3 text-left shadow-[0_20px_60px_rgba(0,0,0,.5)] backdrop-blur-xl transition-all duration-[400ms] ${visible ? "translate-y-0 opacity-100" : "-translate-y-10 opacity-0"}`} data-metrix-notification-toast onClick={() => void open()} type="button">
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#E4D6B6] text-[11px] font-black tracking-[.12em] text-[#14120F]">MX</span>
    <span className="min-w-0"><span className="block truncate text-sm font-bold text-[#F4EFE4]">{active.title}</span>{active.body ? <span className="mt-1 block truncate text-xs text-[#B8AD99]">{active.body}</span> : null}</span>
  </button>;
}
