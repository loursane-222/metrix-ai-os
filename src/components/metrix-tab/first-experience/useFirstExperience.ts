"use client";

import { useEffect, useState } from "react";

type Bootstrap = { conversationId: string | null; messages: Array<{ role: "metrix" | "user"; content: string }> };

export function useFirstExperience(): Bootstrap | null | undefined {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>();
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/first-experience", { method: "POST", credentials: "include", signal: controller.signal })
      .then((response) => response.json())
      .then((result: { ok: true; data: Bootstrap } | { ok: false }) => {
        if (!controller.signal.aborted) setBootstrap(result.ok ? result.data : null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setBootstrap(null);
      });
    return () => controller.abort();
  }, []);
  return bootstrap;
}
