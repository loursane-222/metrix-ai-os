"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  INITIAL_SOUND_STATE,
  decideSound,
  type SoundState
} from "./notification-delivery-state";
import { playNotificationSound, primeNotificationSound } from "./notification-sound";

// In-app delivery of the signed-in user's own unread canonical
// notifications. There is no push/SSE/WebSocket transport in NEXT, so
// this polls the notification API: on mount (a refresh always shows what
// is unread), on a steady interval, when the window regains focus, and
// immediately after a conversation turn (MetrixConversation dispatches
// REFRESH_EVENT). It renders display fields only — never an id, an error
// or a source reference.

export const NOTIFICATIONS_REFRESH_EVENT = "metrix:notifications-refresh";

const POLL_INTERVAL_MS = 20_000;
const MAX_VISIBLE = 3;

type ToastNotification = {
  id: string;
  category: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  title: string;
  body: string | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  TASKS: "Görevler",
  SALES: "Satış",
  FINANCE: "Finans",
  CRITICAL: "Kritik"
};

function isToastNotification(value: unknown): value is ToastNotification {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.category === "string" &&
    typeof record.title === "string"
  );
}

export function MetrixNotificationToast() {
  const [items, setItems] = useState<ToastNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const stoppedRef = useRef(false);
  const dismissedRef = useRef<Set<string>>(new Set());
  const soundRef = useRef<SoundState>(INITIAL_SOUND_STATE);

  const refresh = useCallback(async () => {
    if (stoppedRef.current) return;

    try {
      const response = await fetch("/api/notifications", {
        credentials: "include",
        cache: "no-store"
      });

      if (response.status === 401 || response.status === 403) {
        stoppedRef.current = true;
        return;
      }

      const payload: unknown = await response.json();

      if (
        typeof payload !== "object" ||
        payload === null ||
        (payload as { ok?: unknown }).ok !== true ||
        !Array.isArray((payload as { notifications?: unknown }).notifications)
      ) {
        return;
      }

      const list = (payload as { notifications: unknown[] }).notifications
        .filter(isToastNotification)
        .filter(item => !dismissedRef.current.has(item.id));

      setItems(list);
      setUnreadCount(
        typeof (payload as { unreadCount?: unknown }).unreadCount === "number"
          ? (payload as { unreadCount: number }).unreadCount
          : list.length
      );

      // Sound follows the toast, never precedes or blocks it: it is decided
      // once per new notification (the first fetch is only a baseline) and
      // any audio failure is swallowed inside playNotificationSound.
      const decision = decideSound(
        soundRef.current,
        list.map(item => item.id)
      );
      soundRef.current = decision.state;
      if (decision.play) void playNotificationSound();
    } catch {
      // A transient failure just means the next poll tries again.
    }
  }, []);

  useEffect(() => {
    void refresh();

    const interval = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    const onRefresh = () => void refresh();

    window.addEventListener("focus", onRefresh);
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onRefresh);
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
    };
  }, [refresh]);

  // Browsers only let audio start after a real user gesture. The user's normal
  // interaction with METRIX (typing, clicking, tapping) primes the sound once;
  // the listeners drop away as soon as audio is usable.
  useEffect(() => {
    const gestures = ["pointerdown", "pointerup", "keydown"] as const;
    let disposed = false;

    const remove = () => {
      for (const gesture of gestures) document.removeEventListener(gesture, unlock, true);
    };
    const unlock = () => {
      void primeNotificationSound().then(ready => {
        if (ready && !disposed) remove();
      });
    };

    for (const gesture of gestures) document.addEventListener(gesture, unlock, true);

    return () => {
      disposed = true;
      remove();
    };
  }, []);

  const markRead = useCallback(async (id: string) => {
    dismissedRef.current.add(id);
    setItems(current => current.filter(item => item.id !== id));
    setUnreadCount(count => Math.max(0, count - 1));

    try {
      await fetch("/api/notifications", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: id })
      });
    } catch {
      // Not marked read on the server: it shows again on the next refresh.
      dismissedRef.current.delete(id);
    }
  }, []);

  if (items.length === 0) return null;

  const visible = items.slice(0, MAX_VISIBLE);
  const hidden = Math.max(0, unreadCount - visible.length);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-3 top-[calc(64px+env(safe-area-inset-top))] z-50 flex w-[min(92vw,360px)] flex-col gap-2 sm:right-6"
      data-notification-toast
    >
      {visible.map(item => (
        <div
          className={`pointer-events-auto rounded-xl border px-3 py-2.5 shadow-lg backdrop-blur ${
            item.priority === "CRITICAL" || item.priority === "HIGH"
              ? "border-amber-400/40 bg-[#1a1408]/95"
              : "border-white/15 bg-[#08101f]/95"
          }`}
          key={item.id}
          role="status"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-white/45">
                {CATEGORY_LABEL[item.category] ?? "Bildirim"}
              </p>
              <p className="mt-0.5 text-sm font-medium text-white">{item.title}</p>
              {item.body ? (
                <p className="mt-0.5 text-xs text-white/60">{item.body}</p>
              ) : null}
            </div>
            <button
              aria-label="Okundu olarak işaretle"
              className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
              onClick={() => void markRead(item.id)}
              type="button"
            >
              Okundu
            </button>
          </div>
        </div>
      ))}
      {hidden > 0 ? (
        <p className="pointer-events-auto rounded-md bg-[#08101f]/90 px-2 py-1 text-center text-xs text-white/50">
          +{hidden} okunmamış bildirim daha
        </p>
      ) : null}
    </div>
  );
}
