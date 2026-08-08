"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApprovalLifecycleEnvelope } from "@/lib/executive-lifecycle";

type ApprovalResponse =
  | { ok: true; data: { approvals: ApprovalLifecycleEnvelope[] } }
  | { ok: false };

export type PendingWorkItem = Readonly<{
  envelope: ApprovalLifecycleEnvelope;
  paymentAmount?: number;
}>;

/** Server-backed pending work queue; independent from the currently visible workspace. */
export function usePendingWork(refreshKey?: string | null) {
  const [approvals, setApprovals] = useState<PendingWorkItem[]>([]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/executive/approvals", { credentials: "include" });
      const json = await response.json() as ApprovalResponse;
      if (!json.ok) return;
      const pending = json.data.approvals.filter((item) => item.approval.currentStatus === "PENDING");
      const paymentApprovals = pending.filter((item) => item.approval.actionName === "payment.apply");
      if (!paymentApprovals.length) {
        setApprovals(pending.map((envelope) => ({ envelope })));
        return;
      }
      try {
        const paymentsResponse = await fetch("/api/payments", { credentials: "include" });
        const paymentsJson = await paymentsResponse.json() as { ok: true; data: { payments: Array<{ id: string; amount: string; paidAmount: string }> } } | { ok: false };
        if (!paymentsJson.ok) {
          setApprovals(pending.map((envelope) => ({ envelope })));
          return;
        }
        const byId = new Map(paymentsJson.data.payments.map((payment) => [payment.id, payment]));
        setApprovals(pending.map((envelope) => {
          const payment = envelope.target?.entityId ? byId.get(envelope.target.entityId) : undefined;
          return { envelope, paymentAmount: payment ? Math.max(0, Number(payment.amount) - Number(payment.paidAmount)) : undefined };
        }));
      } catch {
        setApprovals(pending.map((envelope) => ({ envelope })));
      }
    } catch {
      // The queue is advisory UI; the server remains the source of truth for decisions.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(interval);
  }, [refresh, refreshKey]);

  return { approvals, refresh };
}
