"use client";
import { useEffect, useState } from "react";
import {
  cancelCollectionLifecycleAction,
  confirmCollectionLifecycleAction,
  listCollectionActions,
  requestCollectionLifecycleAction,
  type CollectionActionRow,
  type CollectionLifecycleStatus,
} from "@/lib/collection-actions/collection-actions-client";

const ACTION_TYPE_LABEL: Record<CollectionActionRow["actionType"], string> = {
  CALL: "Arama",
  MEETING: "Görüşme",
  LEGAL_NOTICE: "Hukuki İhtar",
  REMINDER: "Hatırlatma",
  NEGOTIATION: "Pazarlık",
  FOLLOW_UP: "Takip",
};

/**
 * Tahsilat Aksiyonları — AI-suggested dunning/follow-up review surface.
 * Reuses the existing, already-live CollectionAction data model and the
 * collection.set_lifecycle Action Runtime capability (HIGH-risk/EXPLICIT
 * approval, same request→confirm→cancel gateway pattern as payment.apply /
 * customer.archive). No new authority — only IN_PROGRESS/DONE/DISMISSED
 * transitions, in this slice exposed as Tamamlandı/Reddet.
 */
export function CollectionActionsPanel() {
  const [rows, setRows] = useState<CollectionActionRow[] | null>(null);

  const refresh = () => {
    void listCollectionActions().then((result) => { if (result.ok) setRows(result.data.collectionActions); });
  };

  useEffect(() => { refresh(); }, []);

  if (rows === null) return null;
  if (rows.length === 0) return null;

  return <div className="mb-4 rounded-[22px] border border-white/[.08] bg-white/[.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-xl">
    <h2 className="text-sm font-semibold text-[#d5dade]">Tahsilat Aksiyonları</h2>
    <p className="mt-1 text-xs text-[#788691]">METRIX&apos;in geciken/kısmi tahsilatlar için önerdiği aksiyonlar.</p>
    <div className="mt-3 grid gap-2">
      {rows.map((row) => <CollectionActionRowItem key={row.id} row={row} onChanged={refresh}/>)}
    </div>
  </div>;
}

function CollectionActionRowItem({ row, onChanged }: { row: CollectionActionRow; onChanged: () => void }) {
  const [approval, setApproval] = useState<{ approvalId: string; status: CollectionLifecycleStatus } | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestStatus(status: CollectionLifecycleStatus) {
    setBusy(true);
    const result = await requestCollectionLifecycleAction(row.id, status);
    setBusy(false);
    if (result.ok) setApproval({ approvalId: result.data.approval.approvalId, status });
  }
  async function cancel() {
    if (!approval) return;
    setBusy(true);
    await cancelCollectionLifecycleAction(row.id, approval.approvalId);
    setBusy(false);
    setApproval(null);
  }
  async function confirm() {
    if (!approval) return;
    setBusy(true);
    const result = await confirmCollectionLifecycleAction(row.id, approval.approvalId, approval.status);
    setBusy(false);
    if (result.ok) { setApproval(null); onChanged(); }
  }

  return <div className="rounded-2xl border border-white/[.06] bg-white/[.02] p-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#d5dade]">{row.payment.person?.fullName ?? row.payment.title}</p>
        <p className="mt-0.5 text-xs text-[#a9b3ba]">{ACTION_TYPE_LABEL[row.actionType]} — {row.title}</p>
        {row.aiReason ? <p className="mt-1 text-[11px] text-[#667580]">{row.aiReason}</p> : null}
      </div>
    </div>
    <div className="mt-3 flex items-center justify-end gap-2">
      {approval
        ? <>
          <button className="rounded-xl px-3 py-2 text-xs font-semibold text-[#8b95a3]" disabled={busy} onClick={() => void cancel()} type="button">Vazgeç</button>
          <button className="rounded-xl border border-[#35dce3]/20 bg-[#35dce3]/10 px-3 py-2 text-xs font-semibold text-[#35dce3]" disabled={busy} onClick={() => void confirm()} type="button">Onayla</button>
        </>
        : <>
          <button className="rounded-xl px-3 py-2 text-xs font-semibold text-[#8b95a3]" disabled={busy} onClick={() => void requestStatus("DISMISSED")} type="button">Reddet</button>
          <button className="rounded-xl border border-[#35dce3]/20 bg-[#35dce3]/10 px-3 py-2 text-xs font-semibold text-[#35dce3]" disabled={busy} onClick={() => void requestStatus("DONE")} type="button">Tamamlandı</button>
        </>}
    </div>
  </div>;
}
