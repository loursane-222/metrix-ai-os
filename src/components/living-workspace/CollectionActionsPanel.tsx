"use client";
import { useCallback, useEffect, useState } from "react";
import {
  cancelCollectionLifecycleAction,
  confirmCollectionLifecycleAction,
  listCollectionActions,
  requestCollectionLifecycleAction,
  type CollectionActionRow,
  type CollectionLifecycleStatus,
} from "@/lib/collection-actions/collection-actions-client";
import { ExecutiveStroke, PendingWorkRail } from "@/components/executive-signatures/SignatureComponents";
import { WorkspaceSurface } from "./WorkspaceSurface";
import type { CollectionActionEditCommand, CollectionActionEditCommandExecutionResult } from "@/lib/collection-actions/collection-action-edit-command-contract";
import { registerCollectionActionEditSurfaceTarget, unregisterCollectionActionEditSurfaceTarget } from "@/lib/collection-actions/collection-action-edit-surface-command-channel";

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

  return <WorkspaceSurface title="Önerilen tahsilat aksiyonları" subtitle="Geciken ve kısmi tahsilatlar için METRIX önerileri.">
    <div className="grid gap-2">
      {rows.map((row) => <CollectionActionRowItem key={row.id} row={row} onChanged={refresh}/>)}
    </div>
  </WorkspaceSurface>;
}

function CollectionActionRowItem({ row, onChanged }: { row: CollectionActionRow; onChanged: () => void }) {
  const [approval, setApproval] = useState<{ approvalId: string; status: CollectionLifecycleStatus } | null>(null);
  const [busy, setBusy] = useState(false);

  const requestStatus = useCallback(async (status: CollectionLifecycleStatus) => {
    setBusy(true);
    const result = await requestCollectionLifecycleAction(row.id, status);
    setBusy(false);
    if (result.ok) setApproval({ approvalId: result.data.approval.approvalId, status });
  }, [row.id]);
  const cancel = useCallback(async () => {
    if (!approval) return;
    setBusy(true);
    await cancelCollectionLifecycleAction(row.id, approval.approvalId);
    setBusy(false);
    setApproval(null);
  }, [approval, row.id]);
  const confirm = useCallback(async () => {
    if (!approval) return;
    setBusy(true);
    const result = await confirmCollectionLifecycleAction(row.id, approval.approvalId, approval.status);
    setBusy(false);
    if (result.ok) { setApproval(null); onChanged(); }
  }, [approval, onChanged, row.id]);
  useEffect(() => { const runtime = { getState: () => ({ hasPendingApproval: approval !== null, actionType: row.actionType, paymentTitle: row.payment.title }), applyCommand: async (command: CollectionActionEditCommand): Promise<CollectionActionEditCommandExecutionResult> => { if (command.type === "request") await requestStatus(command.status); else if (command.type === "confirm") await confirm(); else await cancel(); return { status: "EXECUTED", command }; } }; const token = registerCollectionActionEditSurfaceTarget({ entityId: row.id, runtime }); return () => unregisterCollectionActionEditSurfaceTarget(token); }, [approval, cancel, confirm, requestStatus, row.actionType, row.id, row.payment.title]);

  return <div className="workspace-record">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#EDE7D9]">{row.payment.person?.fullName ?? row.payment.title}</p>
        <p className="mt-0.5 text-xs text-[#C9BFA8]">{ACTION_TYPE_LABEL[row.actionType]} — {row.title}</p>
        {row.aiReason ? <p className="mt-1 text-[11px] text-[#7C7466]">{row.aiReason}</p> : null}
      </div>
    </div>
    <div className="mt-3 flex items-center justify-end gap-2">
      {approval
        ? <PendingWorkRail work={{ title: "Tahsilat aksiyonu bekliyor", nextStep: `${ACTION_TYPE_LABEL[row.actionType]} sonucu kayda alınacak`, onPrimary: () => void confirm(), onCancel: () => void cancel(), primaryContent: <ExecutiveStroke label={busy ? "İşleniyor…" : "Aksiyonu kesinleştir"} onCommit={() => void confirm()} onCancel={() => void cancel()} /> }} />
        : <>
          <button className="rounded-xl px-3 py-2 text-xs font-semibold text-[#8b95a3]" disabled={busy} onClick={() => void requestStatus("DISMISSED")} type="button">Reddet</button>
          <button className="rounded-xl border border-[#C9BFA8]/20 bg-[#C9BFA8]/10 px-3 py-2 text-xs font-semibold text-[#C9BFA8]" disabled={busy} onClick={() => void requestStatus("DONE")} type="button">Tamamlandı</button>
        </>}
    </div>
  </div>;
}
