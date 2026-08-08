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
};
const AUTHORITIES: Record<string, string> = { Customer: "customers.detail.page", Task: "workspace.task.page", Quote: "offers.edit.page", Payment: "workspace.payment.page", Invoice: "workspace.invoice.page" };

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
    const response = await fetch("/api/notifications?unreadOnly=true", { credentials: "include" });
    if (!response.ok) return;
    const payload = await response.json() as { data?: { notifications?: ToastNotification[] } };
    const rows = payload.data?.notifications ?? [];
    if (seen.current.size === 0) { rows.forEach((row) => seen.current.add(row.id)); return; }
    const fresh = rows.filter((row) => !seen.current.has(row.id)).reverse();
    fresh.forEach((row) => { seen.current.add(row.id); queue.current.push(row); });
    showNext();
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
