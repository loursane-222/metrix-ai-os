"use client";

import { useEffect } from "react";
import { useExecutivePresence } from "./ExecutivePresenceContext";
import { universalInputAuthorityHost, universalInputRegistry } from "@/lib/input-authority";

/**
 * Resolves runtime scope IDs only against explicit executive metadata. Pages
 * opt in with data-executive-target; unsupported targets intentionally no-op.
 */
export function ExecutivePageFocusHost() {
  const { activitySnapshot, behaviorSnapshot } = useExecutivePresence();

  useEffect(() => {
    const lifecycle = activitySnapshot.items.at(-1)?.lifecycle;
    const targetId = lifecycle?.target?.executiveTargetId ?? behaviorSnapshot.scopeId;
    if (!targetId) return;
    if (universalInputRegistry.getByTargetId(targetId)) {
      void universalInputAuthorityHost.execute({ type: "REVEAL", executiveTargetId: targetId }).then(() =>
        universalInputAuthorityHost.execute({ type: "FOCUS", executiveTargetId: targetId }),
      );
      return;
    }
    const target = document.querySelector<HTMLElement>(
      `[data-executive-target="${CSS.escape(targetId)}"]`,
    );
    if (!target) return;

    const state = lifecycle?.source === "approval" && lifecycle.status === "waiting"
      ? "approval-target"
      : lifecycle?.status === "active" || behaviorSnapshot.status === "applying"
        ? "pending-mutation"
        : lifecycle?.status === "failed" || behaviorSnapshot.status === "error"
          ? "validation-error"
          : lifecycle?.status === "succeeded" || behaviorSnapshot.status === "completed"
            ? "applied-mutation"
            : "focus";
    target.dataset.executiveFocus = state;
    return () => {
      if (target.dataset.executiveFocus === state) delete target.dataset.executiveFocus;
    };
  }, [activitySnapshot.items, behaviorSnapshot.scopeId, behaviorSnapshot.status]);

  return null;
}
