"use client";

import { useEffect, useRef, useState } from "react";

import settingsStyles from "./SettingsMenu.module.css";

const CONVERSATION_STORAGE_KEY = "metrix-chat-conversation-id";

/**
 * Ported from the approved metrix-ai-os SettingsMenu (same rail/content
 * two-pane markup and CSS module). Two deliberate omissions, both out of
 * this operation's scope: the "Metrix Filmi" rail item (brand film player)
 * and the voicePreference field (no legacy voice runtime in NEXT, and
 * NEXT's User model has no such column) — the account form otherwise reads
 * and writes NEXT's own /api/user/profile route.
 */
export function SettingsMenu({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<"menu" | "logout" | "account" | "notifications">("menu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function logout() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      const result = (await response.json()) as { ok: boolean; error?: { message?: string } };
      if (!response.ok || !result.ok) throw new Error(result.error?.message ?? "Oturum kapatılamadı.");
      window.localStorage.removeItem(CONVERSATION_STORAGE_KEY);
      window.location.replace("/login");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Oturum kapatılamadı.");
      setBusy(false);
    }
  }

  return (
    <div
      className={settingsStyles.overlay}
      data-settings-overlay
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div aria-label="Ayarlar" aria-modal="true" className={settingsStyles.shell} data-settings-shell ref={panelRef} role="dialog">
        <aside className={settingsStyles.rail} data-settings-rail>
          <p className={settingsStyles.eyebrow}>Ayarlar</p>
          <button
            className={`${settingsStyles.railItem} ${view === "account" || view === "menu" ? settingsStyles.active : ""}`}
            onClick={() => setView("account")}
            type="button"
          >
            <span className={settingsStyles.iconCircle}><SettingsAccountIcon /></span><span>Hesap Ayarları</span>
          </button>
          <button
            className={`${settingsStyles.railItem} ${view === "notifications" ? settingsStyles.active : ""}`}
            onClick={() => setView("notifications")}
            type="button"
          >
            <span className={settingsStyles.iconCircle}><SettingsBellIcon /></span><span>Bildirimler</span>
          </button>
          <button
            className={`${settingsStyles.railItem} ${settingsStyles.danger} ${view === "logout" ? settingsStyles.activeDanger : ""}`}
            onClick={() => setView("logout")}
            type="button"
          >
            <span className={settingsStyles.iconPlain}><SettingsLogoutIcon /></span><span>Çıkış Yap</span>
          </button>
          <div className={settingsStyles.railFoot}><span />Kullanıcı ayarları</div>
        </aside>
        <section className={settingsStyles.content} data-settings-content>
          <div className={settingsStyles.contentHead}>
            <p className={settingsStyles.kicker}>{view === "logout" ? "Oturum" : view === "notifications" ? "Uyarılar" : "Kişisel profil"}</p>
            <h1>{view === "logout" ? "Çıkış Yap" : view === "notifications" ? "Bildirimler" : "Hesap Ayarları"}</h1>
            <p>{view === "logout" ? "Bu cihazdaki Metrix oturumunu güvenli biçimde sonlandırın." : view === "notifications" ? "METRIX'in size hangi konularda kendiliğinden haber vereceğini seçin." : "METRIX deneyiminizde kullanılan kişisel bilgileri yönetin."}</p>
          </div>
          <div className={settingsStyles.contentBody}>
            {view === "logout" ? (
              <div className={settingsStyles.logoutPanel}>
                <span className={settingsStyles.logoutSymbol}><SettingsLogoutIcon /></span>
                <h2>Oturumu kapat</h2>
                <p>Bu cihazdaki Metrix oturumunu kapatmak istiyor musunuz?</p>
                <div className={settingsStyles.logoutActions}>
                  <button disabled={busy} onClick={() => setView("account")} type="button">Vazgeç</button>
                  <button className={settingsStyles.confirmLogout} disabled={busy} onClick={() => void logout()} type="button">{busy ? "Çıkış yapılıyor…" : "Çıkış Yap"}</button>
                </div>
              </div>
            ) : view === "notifications" ? (
              <NotificationSettingsForm />
            ) : (
              <AccountSettingsForm onBack={() => setView("menu")} />
            )}
            {error ? <p aria-live="polite" className={settingsStyles.menuError}>{error}</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function AccountSettingsForm({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/user/profile", { credentials: "include" });
        const result = (await response.json()) as {
          ok: boolean;
          data?: { user: { fullName: string | null; email: string | null; timezone: string } };
          error?: { message?: string };
        };
        if (!response.ok || !result.ok || !result.data) throw new Error(result.error?.message ?? "Profil yüklenemedi.");
        if (cancelled) return;
        setFullName(result.data.user.fullName ?? "");
        setEmail(result.data.user.email ?? "");
        setTimezone(result.data.user.timezone);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Profil yüklenemedi.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const patch: Record<string, string> = {};
      if (fullName.trim()) patch.fullName = fullName;
      if (email.trim()) patch.email = email;
      if (timezone.trim()) patch.timezone = timezone;

      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const result = (await response.json()) as { ok: boolean; error?: { message?: string } };
      if (!response.ok || !result.ok) throw new Error(result.error?.message ?? "Kaydedilemedi.");
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className={settingsStyles.loading} aria-live="polite"><span />Yükleniyor…</div>;

  return (
    <div className={settingsStyles.accountForm}>
      <label className={settingsStyles.fieldRow}>
        <span className={settingsStyles.fieldCopy}><strong>Ad Soyad</strong><small>METRIX'in size hitap ederken kullandığı ad.</small></span>
        <input onChange={(event) => setFullName(event.target.value)} type="text" value={fullName} />
      </label>
      <label className={settingsStyles.fieldRow}>
        <span className={settingsStyles.fieldCopy}><strong>E-posta</strong><small>Hesabınız ve oturumunuzla ilişkili e-posta adresi.</small></span>
        <input onChange={(event) => setEmail(event.target.value)} type="email" value={email} />
      </label>
      <label className={settingsStyles.fieldRow}>
        <span className={settingsStyles.fieldCopy}><strong>Saat Dilimi</strong><small>Tarih, saat ve günlük özetlerin yerel zaman referansı.</small></span>
        <input onChange={(event) => setTimezone(event.target.value)} type="text" value={timezone} />
      </label>
      <div className={settingsStyles.formFoot}>
        <div>
          {error ? <p aria-live="polite" className={settingsStyles.formError}>{error}</p> : null}
          {saved ? <p aria-live="polite" className={settingsStyles.saved}>Kaydedildi.</p> : null}
        </div>
        <div className={settingsStyles.formActions}>
          <button disabled={saving} onClick={onBack} type="button">Geri</button>
          <button className={settingsStyles.save} disabled={saving} onClick={() => void save()} type="button">{saving ? "Kaydediliyor…" : "Kaydet"}</button>
        </div>
      </div>
    </div>
  );
}

type NotificationPreferenceState = {
  critical: boolean;
  finance: boolean;
  sales: boolean;
  tasks: boolean;
  muteAll: boolean;
};

const NOTIFICATION_OPTIONS: ReadonlyArray<{
  key: "critical" | "finance" | "sales" | "tasks";
  label: string;
  hint: string;
}> = [
  { key: "critical", label: "Kritik olaylar", hint: "Müdahale gerektiren önemli durumlar." },
  { key: "finance", label: "Finans", hint: "Fatura ve tahsilat gibi para hareketleri." },
  { key: "sales", label: "Satış", hint: "Yeni müşteri, teklif ve sipariş gelişmeleri." },
  { key: "tasks", label: "Görevler", hint: "Görevler, toplantılar ve yaklaşan hatırlatmalar." }
];

function NotificationSettingsForm() {
  const [preferences, setPreferences] = useState<NotificationPreferenceState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/notifications/preferences", { credentials: "include" });
        const result = (await response.json()) as { ok: boolean; preferences?: NotificationPreferenceState };
        if (!response.ok || !result.ok || !result.preferences) throw new Error();
        if (!cancelled) setPreferences(result.preferences);
      } catch {
        if (!cancelled) setError("Bildirim tercihleri yüklenemedi.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Each switch saves on its own; the shown state is always the value the
  // server stored and read back, never an optimistic guess.
  async function change(patch: Partial<NotificationPreferenceState>) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/notifications/preferences", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const result = (await response.json()) as { ok: boolean; preferences?: NotificationPreferenceState };
      if (!response.ok || !result.ok || !result.preferences) throw new Error();
      setPreferences(result.preferences);
      window.dispatchEvent(new Event("metrix:notifications-refresh"));
    } catch {
      setError("Tercih kaydedilemedi. Tekrar deneyin.");
    } finally {
      setSaving(false);
    }
  }

  if (!preferences) {
    return error
      ? <p aria-live="polite" className={settingsStyles.menuError}>{error}</p>
      : <div className={settingsStyles.loading} aria-live="polite"><span />Yükleniyor…</div>;
  }

  return (
    <div className={settingsStyles.accountForm}>
      {NOTIFICATION_OPTIONS.map((option) => (
        <div className={settingsStyles.fieldRow} key={option.key}>
          <span className={settingsStyles.fieldCopy}><strong>{option.label}</strong><small>{option.hint}</small></span>
          <button
            aria-checked={preferences[option.key]}
            aria-label={option.label}
            className={settingsStyles.switch}
            disabled={saving || preferences.muteAll}
            onClick={() => void change({ [option.key]: !preferences[option.key] })}
            role="switch"
            type="button"
          />
        </div>
      ))}
      <div className={settingsStyles.fieldRow}>
        <span className={settingsStyles.fieldCopy}><strong>Hiç konuşmasın</strong><small>Açıkken METRIX hiçbir bildirimi kendiliğinden göstermez ve ses çalmaz. Kayıtlar silinmez.</small></span>
        <button
          aria-checked={preferences.muteAll}
          aria-label="Hiç konuşmasın"
          className={settingsStyles.switch}
          disabled={saving}
          onClick={() => void change({ muteAll: !preferences.muteAll })}
          role="switch"
          type="button"
        />
      </div>
      {error ? <p aria-live="polite" className={settingsStyles.menuError}>{error}</p> : null}
    </div>
  );
}

function SettingsBellIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Zm4 4a2 2 0 0 0 4 0" /></svg>;
}

function SettingsAccountIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.2" /><path d="M5.6 19c.8-4 3-6 6.4-6s5.6 2 6.4 6" /></svg>;
}

function SettingsLogoutIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 5H5v14h5M13 8l4 4-4 4m4-4H9" /></svg>;
}
