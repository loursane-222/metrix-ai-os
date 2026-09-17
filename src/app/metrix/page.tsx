"use client";

import { useEffect, useRef, useState } from "react";

import { ExecutiveAppShell } from "../../components/living-workspace/ExecutiveAppShell";
import { useExecutiveHeaderActions } from "../../components/living-workspace/ExecutiveHeaderActionsContext";
import {
  MetrixConversation,
  type MetrixConversationHandle
} from "../../components/metrix-conversation/MetrixConversation";
import { HistorySheet } from "../../components/metrix-conversation/HistorySheet";
import { SettingsMenu } from "../../components/metrix-conversation/SettingsMenu";

type SessionState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated" };

function MetrixWorkspace() {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const conversationRef = useRef<MetrixConversationHandle>(null);

  useExecutiveHeaderActions({
    openHistory: () => setIsHistoryOpen(true),
    toggleSettings: () => setIsSettingsOpen((open) => !open)
  });

  return (
    <>
      <MetrixConversation ref={conversationRef} />
      {isHistoryOpen ? (
        <HistorySheet
          onClose={() => setIsHistoryOpen(false)}
          onNew={() => conversationRef.current?.startNewConversation()}
          onSelect={(conversationId) => conversationRef.current?.resumeConversation(conversationId)}
        />
      ) : null}
      {isSettingsOpen ? <SettingsMenu onClose={() => setIsSettingsOpen(false)} /> : null}
    </>
  );
}

export default function MetrixPage() {
  const [session, setSession] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/session", { credentials: "include" })
      .then((response) => response.json())
      .then((payload: unknown) => {
        if (cancelled) return;

        if (
          typeof payload === "object" &&
          payload !== null &&
          "authenticated" in payload &&
          (payload as { authenticated: boolean }).authenticated
        ) {
          const data = payload as unknown as { organization: { id: string } | null };

          if (!data.organization) {
            window.location.href = "/login";
            return;
          }

          setSession({ status: "authenticated" });
        } else {
          window.location.href = "/login";
        }
      })
      .catch(() => setSession({ status: "unauthenticated" }));

    return () => {
      cancelled = true;
    };
  }, []);

  if (session.status !== "authenticated") {
    return (
      <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", color: "#8297ad", fontSize: 13 }}>
        Yükleniyor…
      </div>
    );
  }

  return (
    <ExecutiveAppShell>
      <MetrixWorkspace />
    </ExecutiveAppShell>
  );
}
