"use client";

import { useState } from "react";

import { Atmosphere, entryStyles as styles } from "./AuthShell";

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
    <main className={styles.stage}>
      <Atmosphere />
      <header className={styles.identity}>METRIX</header>
      <div className={styles.setupWrap}>
        <section className={styles.setupShell}>
          <p className={styles.eyebrow}>ÇALIŞMA ORTAMI</p>
          <h1 className={styles.setupTitle}>Şirket bağlamınızı oluşturun</h1>
          <p className={styles.setupLede}>METRIX çalışma ortamınızı şirketinizle ilişkilendirmek için yalnızca şirket adınız yeterli.</p>
          <form onSubmit={submit}>
            <label className={styles.fieldLabel} htmlFor="organization-name">Şirket adı</label>
            <input autoComplete="organization" autoFocus className={styles.input} disabled={busy} id="organization-name" onChange={(e) => setName(e.target.value)} placeholder="Örnek: Arda Mobilya" value={name} />
            {error ? <p aria-live="polite" className={styles.message}>{error}</p> : null}
            <button className={styles.primary} disabled={busy || !name.trim()} type="submit">{busy ? "Oluşturuluyor…" : "Çalışma ortamını oluştur"}</button>
          </form>
          <p className={styles.setupFoot}>METRIX şirket bağlamınıza hazırlanacak</p>
        </section>
      </div>
    </main>
  );
}
