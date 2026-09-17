"use client";

import { useCallback, useEffect, useState } from "react";

import { AuthExperience } from "../../components/auth/AuthExperience";
import { OrganizationSetup } from "../../components/auth/OrganizationSetup";
import { Presence, entryStyles as styles } from "../../components/auth/AuthShell";

type SessionState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "needs-organization" }
  | { status: "ready" };

async function fetchSessionState(): Promise<SessionState> {
  try {
    const response = await fetch("/api/auth/session", { credentials: "include" });
    const payload: unknown = await response.json();

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("authenticated" in payload) ||
      !(payload as { authenticated: boolean }).authenticated
    ) {
      return { status: "unauthenticated" };
    }

    const data = payload as unknown as { organization: { id: string } | null };
    return data.organization ? { status: "ready" } : { status: "needs-organization" };
  } catch {
    return { status: "unauthenticated" };
  }
}

/**
 * Ported gating pattern from the approved metrix-ai-os onboarding app:
 * check /api/auth/session, show the (ported, verbatim) email/OTP form when
 * unauthenticated, the (ported, verbatim) organization setup screen when
 * authenticated without an organization, and redirect to /metrix once both
 * are satisfied.
 */
export default function LoginPage() {
  const [session, setSession] = useState<SessionState>({ status: "loading" });

  const refresh = useCallback(async () => {
    const next = await fetchSessionState();
    if (next.status === "ready") {
      window.location.href = "/metrix";
      return;
    }
    setSession(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (session.status === "loading" || session.status === "ready") {
    return (
      <main className={styles.stage}>
        <div className={styles.loadingWrap}>
          <Presence loading />
          <div className={styles.loadingCopy}>
            <p>Yükleniyor</p>
            <span className={styles.dots}><i /><i /><i /></span>
          </div>
        </div>
      </main>
    );
  }

  if (session.status === "needs-organization") {
    return <OrganizationSetup contextError={null} onCreated={refresh} />;
  }

  return <AuthExperience contextError={null} onAuthenticated={refresh} />;
}
