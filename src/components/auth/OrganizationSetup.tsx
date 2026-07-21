"use client";

import { useState } from "react";

import { AuthShell, authButtonClass, authInputClass } from "./AuthShell";

type ApiResponse = { ok: true } | { ok: false; error: { message: string } };

export function OrganizationSetup({ contextError, onCreated }: { contextError: string | null; onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(contextError);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Şirket adını girin.");
    setBusy(true);
    setError(null);
    const response = await fetch("/api/organizations", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationName: name.trim() }) });
    const result = (await response.json()) as ApiResponse;
    if (!result.ok) {
      setBusy(false);
      return setError(result.error.message);
    }
    await onCreated();
    setBusy(false);
  }

  return (
    <AuthShell>
      <div className="mb-6 border-b border-white/[0.08] pb-5">
        <h2 className="text-lg font-semibold text-[#f4f7f8]">Çalışma alanınızı oluşturun</h2>
        <p className="mt-1 text-sm leading-6 text-[#93a0ad]">Başlamak için yalnızca şirket adınız yeterli.</p>
      </div>
      <form onSubmit={submit}>
        <label className="text-xs font-semibold text-[#cfd7dc]" htmlFor="organization-name">Şirket adı</label>
        <input autoComplete="organization" autoFocus className={authInputClass} disabled={busy} id="organization-name" onChange={(e) => setName(e.target.value)} placeholder="Örnek: Arda Mobilya" value={name} />
        {error ? <p aria-live="polite" className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p> : null}
        <button className={authButtonClass} disabled={busy || !name.trim()} type="submit">{busy ? "Oluşturuluyor…" : "Metrix’e geç"}</button>
      </form>
    </AuthShell>
  );
}
