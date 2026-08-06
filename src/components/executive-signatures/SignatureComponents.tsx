"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export type PendingWork = { title: string; nextStep: string; onPrimary: () => void; onCancel?: () => void; primaryLabel?: string; primaryContent?: ReactNode };

export function PendingWorkRail({ work }: { work: PendingWork }) {
  const [highlight, setHighlight] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    timer.current = window.setInterval(() => setHighlight(true), 7000);
    return () => { if (timer.current !== null) window.clearInterval(timer.current); };
  }, []);
  useEffect(() => { if (!highlight) return; const id = window.setTimeout(() => setHighlight(false), 450); return () => window.clearTimeout(id); }, [highlight]);
  return <aside aria-label={`Bekleyen iş: ${work.title}`} className={`rounded-xl border border-[#e4d6b6]/20 bg-[#1c1914] p-3 transition-colors duration-400 ${highlight ? "bg-[#b8874a]/[.08]" : ""}`}>
    <p className="text-xs font-semibold text-[#c9bfa8]">{work.title}</p>
    <p className="mt-1 text-xs text-[#7c7466]">Sonraki adım: {work.nextStep}</p>
    <div className="mt-2 flex gap-2">{work.primaryContent ?? <button className="rounded-lg border border-[#e4d6b6]/20 px-3 py-1.5 text-xs text-[#ddd4be]" onClick={work.onPrimary} type="button">{work.primaryLabel ?? "Devam et"}</button>}{work.onCancel ? <button className="rounded-lg px-3 py-1.5 text-xs text-[#7c7466]" onClick={work.onCancel} type="button">Vazgeç</button> : null}</div>
  </aside>;
}

export function ExecutiveStroke({ label = "Kesinleştirmek için kaydır" , onCommit, onCancel }: { label?: string; onCommit: () => void; onCancel?: () => void }) {
  const [value, setValue] = useState(0); const start = useRef<number | null>(null); const committed = useRef(false);
  const commit = () => { if (committed.current) return; committed.current = true; onCommit(); if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(18); };
  const move = (clientX: number, rect: DOMRect) => { const next = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)); setValue(next); if (next >= .82 && start.current !== null && performance.now() - start.current >= 220) commit(); };
  return <div className="rounded-xl border border-[#b8874a]/30 bg-[#1c1914] p-3"><p className="mb-2 text-xs text-[#c9bfa8]">{label}</p><div role="slider" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} tabIndex={0} className="relative h-11 overflow-hidden rounded-full border border-[#e4d6b6]/20 bg-[#14120f]" onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") commit(); if (e.key === "Escape") onCancel?.(); }} onPointerDown={(e) => { start.current = performance.now(); e.currentTarget.setPointerCapture(e.pointerId); move(e.clientX, e.currentTarget.getBoundingClientRect()); }} onPointerMove={(e) => { if (start.current !== null) move(e.clientX, e.currentTarget.getBoundingClientRect()); }} onPointerUp={() => { start.current = null; setValue(0); }}><div className="absolute inset-y-0 left-0 bg-[#b8874a]/20 transition-[width] duration-150" style={{ width: `${value * 100}%` }} /><span className="absolute inset-y-1 left-1 grid w-9 place-items-center rounded-full bg-[#c9bfa8] text-[#14120f]">→</span></div><button className="mt-2 text-xs text-[#7c7466] underline" onClick={() => { setValue(1); commit(); }} type="button">Klavye ile açıkça onayla</button></div>;
}

export function HandoffNotice({ status, title, onRecall }: { status: "completed" | "working"; title: string; onRecall?: () => void }) {
  return <div className="rounded-xl border border-[#e4d6b6]/15 bg-[#1c1914] p-3 transition-[opacity,transform] duration-300"><p className="text-xs font-semibold text-[#ddd4be]">{status === "completed" ? "Tamamlandı" : "İlgileniyorum"}</p><p className="mt-1 text-xs text-[#7c7466]">{title}</p>{onRecall ? <button className="mt-2 text-xs text-[#c9bfa8] underline" onClick={onRecall} type="button">Çalışma alanını geri çağır</button> : null}</div>;
}

export function EvidenceChain({ evidence, children }: { evidence: Array<{ evidenceId: string; summary: string; sourceDomain: string }>; children: ReactNode }) {
  const [open, setOpen] = useState(false); const items = evidence.slice(0, 5);
  if (!items.length) return <>{children}</>;
  return <div><button className="mt-2 text-xs text-[#c9bfa8] underline" onClick={() => setOpen((v) => !v)} type="button">{open ? "Kanıt yolunu kapat" : "Bu kanaate neden vardın?"}</button>{open ? <div className="mt-3 grid gap-2 border-l border-[#c9bfa8]/40 pl-3 transition-opacity duration-500">{items.map((item) => <div key={item.evidenceId} className="rounded-lg border border-[#e4d6b6]/15 bg-[#1c1914] p-2"><p className="text-[10px] uppercase tracking-wider text-[#7c7466]">{item.sourceDomain} · {item.evidenceId}</p><p className="mt-1 text-xs text-[#ddd4be]">{item.summary}</p></div>)}</div> : null}</div>;
}
