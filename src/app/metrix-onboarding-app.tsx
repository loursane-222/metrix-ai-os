"use client";

import { useCallback, useEffect, useState } from "react";

import { AuthExperience } from "@/components/auth/AuthExperience";
import { OrganizationSetup } from "@/components/auth/OrganizationSetup";
import { MetrixTabScreen } from "@/components/metrix-tab/MetrixTabScreen";
import { BrandFilmPlayer } from "@/components/brand-film/BrandFilmPlayer";

type ApiResponse<T> =
  | { ok: true; data: T; status?: number }
  | { ok: false; error: { message: string }; status?: number };

type SessionContext = {
  user: { id: string; phone: string; fullName?: string | null; email?: string | null };
  session: { id: string; expiresAt: string };
};

type OrganizationContext = {
  organization: { id: string; name: string; onboardingStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" };
  membership: { id: string; role: string };
};

async function apiGet<T>(path: string): Promise<ApiResponse<T>> {
  const response = await fetch(path, { credentials: "include" });
  return response.json() as Promise<ApiResponse<T>>;
}

export function MetrixOnboardingApp() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionContext | null>(null);
  const [organization, setOrganization] = useState<OrganizationContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [brandFilm, setBrandFilm] = useState<"loading" | "offer" | "done">("loading");

  const refreshContext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sessionResult = await apiGet<SessionContext>("/api/auth/session");
      if (!sessionResult.ok) {
        setSession(null);
        setOrganization(null);
        return;
      }
      setSession(sessionResult.data);
      const organizationResult = await apiGet<OrganizationContext>("/api/auth/organization-context");
      setOrganization(organizationResult.ok ? organizationResult.data : null);
      if (organizationResult.ok) {
        const filmResult = await apiGet<{ shouldOffer: boolean }>("/api/brand-film");
        setBrandFilm(filmResult.ok && filmResult.data.shouldOffer ? "offer" : "done");
      } else setBrandFilm("loading");
    } catch {
      setSession(null);
      setOrganization(null);
      setError("Oturum kontrolü tamamlanamadı. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshContext();
  }, [refreshContext]);

  if (loading) return <EntryLoading />;
  if (!session) return <AuthExperience contextError={error} onAuthenticated={refreshContext} />;
  if (!organization) return <OrganizationSetup contextError={error} onCreated={refreshContext} />;
  if (brandFilm === "loading") return <EntryLoading />;
  if (brandFilm === "offer") return <BrandFilmPlayer onContinue={() => setBrandFilm("done")} />;

  return (
    <div className="h-[100dvh] overflow-hidden">
      <MetrixTabScreen />
    </div>
  );
}

function EntryLoading() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#061018] text-[#f4f7f8] [color-scheme:dark]">
      <p aria-live="polite" className="text-sm font-medium text-[#93a0ad]">Metrix hazırlanıyor…</p>
    </main>
  );
}
