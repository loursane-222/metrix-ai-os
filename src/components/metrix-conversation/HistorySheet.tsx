"use client";

import { useEffect, useState } from "react";

import { ExecutiveIcon } from "../living-workspace/ExecutiveIcons";
import historyStyles from "./HistorySheet.module.css";

type ConversationSummary = { id: string; title: string; lastMessageAt: string };

function formatHistoryTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

/** Ported verbatim from the approved metrix-ai-os HistorySheet (same markup/CSS module), fetching NEXT's own /api/conversations. */
export function HistorySheet({
  activeConversationId = null,
  onClose,
  onNew,
  onSelect
}: {
  activeConversationId?: string | null;
  onClose: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
}) {
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/conversations", { credentials: "include" })
      .then((response) => response.json())
      .then((payload: unknown) => {
        if (cancelled) return;
        const conversations =
          typeof payload === "object" &&
          payload !== null &&
          "conversations" in payload &&
          Array.isArray((payload as { conversations: unknown }).conversations)
            ? (payload as { conversations: ConversationSummary[] }).conversations
            : [];
        setItems(conversations);
      })
      .catch(() => setItems([]))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss(after: () => void) {
    setVisible(false);
    window.setTimeout(after, 200);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss(onClose);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  return (
    <div className={historyStyles.overlay}>
      <div
        className={`${historyStyles.scrim} ${visible ? historyStyles.scrimVisible : ""}`}
        onClick={() => dismiss(onClose)}
      />
      <div
        aria-label="Sohbet Geçmişi"
        aria-modal="true"
        className={`${historyStyles.panel} ${visible ? historyStyles.panelVisible : ""}`}
        role="dialog"
      >
        <div className={historyStyles.header}>
          <div>
            <p className={historyStyles.eyebrow}>METRIX / KAYITLI AKIŞ</p>
            <h2>Sohbet Geçmişi</h2>
            <p className={historyStyles.subline}>Önceki konuşmalarınıza devam edin.</p>
          </div>
          <button aria-label="Kapat" className={historyStyles.close} onClick={() => dismiss(onClose)} type="button">
            <ExecutiveIcon name="close" className="h-4 w-4" />
          </button>
        </div>
        <div className={historyStyles.newWrap}>
          <button className={historyStyles.newChat} onClick={() => dismiss(onNew)} type="button">
            <svg aria-hidden="true" className={historyStyles.plusIcon} viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg> Yeni Sohbet <kbd>⌘ N</kbd>
          </button>
        </div>
        <div className={historyStyles.list}>
          <p className={historyStyles.listLabel}>SON KONUŞMALAR</p>
          {isLoading ? (
            <p className={historyStyles.state}>Yükleniyor...</p>
          ) : !items || items.length === 0 ? (
            <p className={historyStyles.state}>Henüz geçmiş konuşma yok.</p>
          ) : (
            items.map((item) => {
              const active = item.id === activeConversationId;
              return (
                <button
                  aria-current={active ? "true" : undefined}
                  className={`${historyStyles.row} ${active ? historyStyles.active : ""}`}
                  key={item.id}
                  onClick={() => dismiss(() => onSelect(item.id))}
                  type="button"
                >
                  {active ? <span aria-hidden="true" className={historyStyles.mark} /> : null}
                  <span className={historyStyles.title}>{item.title}</span>
                  <span className={historyStyles.timestamp}>{formatHistoryTimestamp(item.lastMessageAt)}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
