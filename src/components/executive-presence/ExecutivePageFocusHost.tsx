"use client";

import { useEffect } from "react";
import { useExecutivePresence } from "./ExecutivePresenceContext";

/**
 * Resolves runtime scope IDs only against explicit executive metadata. Pages
 * opt in with data-executive-target; unsupported targets intentionally no-op.
 */
export function ExecutivePageFocusHost() {
  const { behaviorSnapshot } = useExecutivePresence();

  useEffect(() => {
    const targetId = behaviorSnapshot.scopeId;
    if (!targetId) return;
    const target = document.querySelector<HTMLElement>(
      `[data-executive-target="${CSS.escape(targetId)}"]`,
    );
    if (!target) return;

    const state = behaviorSnapshot.status === "awaiting_approval"
      ? "approval-target"
      : behaviorSnapshot.status === "applying"
        ? "pending-mutation"
        : behaviorSnapshot.status === "error"
          ? "validation-error"
          : behaviorSnapshot.status === "completed"
            ? "applied-mutation"
            : "focus";
    target.dataset.executiveFocus = state;
    return () => {
      if (target.dataset.executiveFocus === state) delete target.dataset.executiveFocus;
    };
  }, [behaviorSnapshot.scopeId, behaviorSnapshot.status]);

  return null;
}
