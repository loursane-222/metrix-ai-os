"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApprovalLifecycleEnvelope } from "@/lib/executive-lifecycle";

type ApprovalResponse =
  | { ok: true; data: { approvals: ApprovalLifecycleEnvelope[] } }
  | { ok: false };

/** Server-backed pending work queue; independent from the currently visible workspace. */
export function usePendingWork(refreshKey?: string | null) {
  const [approvals, setApprovals] = useState<ApprovalLifecycleEnvelope[]>([]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/executive/approvals", { credentials: "include" });
      const json = await response.json() as ApprovalResponse;
      if (!json.ok) return;
      setApprovals(json.data.approvals.filter((item) => item.approval.currentStatus === "PENDING"));
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
