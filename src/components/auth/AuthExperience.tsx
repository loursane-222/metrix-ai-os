"use client";

import { useEffect, useRef, useState } from "react";

import { AuthShell, entryStyles as styles } from "./AuthShell";

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: { message: string } };
type OtpResponse = { devOtpCode?: string };

export function AuthExperience({ contextError, onAuthenticated }: { contextError: string | null; onAuthenticated: () => Promise<void> }) {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(contextError);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!resendAt) return;
    const update = () => setSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    update();
    const id = window.setInterval(update, 500);
    return () => window.clearInterval(id);
  }, [resendAt]);

  async function post<T>(path: string, body: Record<string, unknown>): Promise<ApiResponse<T>> {
    const response = await fetch(path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return response.json() as Promise<ApiResponse<T>>;
  }

  async function requestOtp(event?: React.FormEvent) {
    event?.preventDefault();
    if (busy || (step === "otp" && seconds > 0)) return;
    const normalized = email.trim().toLowerCase();
    if (!consent) {
      setError("Devam etmek için KVKK Aydınlatma Metni ve Gizlilik Politikası'nı kabul edin.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(normalized)) {
      setError("Geçerli bir e-posta adresi girin.");
      return;
    }
    setBusy(true);
    setError(null);
    setToast(null);
    try {
      const result = await post<OtpResponse>("/api/auth/otp/request", { email: normalized, rememberMe });
      if (!result.ok) {
        setError(result.error.message);
        setToast({ kind: "error", message: result.error.message });
        return;
      }
      setStep("otp");
      setResendAt(Date.now() + 60_000);
      setDevOtp(result.data.devOtpCode ?? null);
      setToast({ kind: "success", message: "Doğrulama kodu gönderildi." });
      window.setTimeout(() => codeRef.current?.focus(), 0);
    } catch {
      const message = "Ağ bağlantısı kurulamadı. Bağlantınızı kontrol edip tekrar deneyin.";
      setError(message);
      setToast({ kind: "error", message });
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(code)) return setError("6 haneli doğrulama kodunu girin.");
    setBusy(true);
    setError(null);
    setToast(null);
    try {
      const result = await post("/api/auth/otp/verify", { email: email.trim().toLowerCase(), code, rememberMe });
      if (!result.ok) {
        setError(result.error.message);
        setToast({ kind: "error", message: result.error.message });
        return;
      }
      await onAuthenticated();
    } catch {
      const message = "Ağ bağlantısı kurulamadı. Bağlantınızı kontrol edip tekrar deneyin.";
      setError(message);
      setToast({ kind: "error", message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      {step === "email" ? (
        <form onSubmit={requestOtp}>
          <p className={styles.eyebrow}>METRIX’E GİRİŞ</p>
          <h1 className={styles.title}>Çalışma ortamınıza devam edin</h1>
          <p className={styles.lede}>E-posta adresinize göndereceğimiz tek kullanımlık kodla giriş yapın.</p>
          <label className={styles.fieldLabel} htmlFor="login-email">E-posta adresi</label>
          <input autoComplete="email" autoFocus className={styles.input} disabled={busy} id="login-email" inputMode="email" onChange={(e) => setEmail(e.target.value)} placeholder="siz@sirketiniz.com" type="email" value={email} />
          <p className={styles.accountNote}>İlk girişinizse hesabınız doğrulama sonrasında otomatik oluşturulur.</p>
          <label className={styles.checkRow}>
            <input checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} type="checkbox" />
            Bu cihazda oturumu hatırla
          </label>
          <label className={`${styles.checkRow} ${styles.consentRow}`}>
            <input aria-describedby="login-consent-copy" checked={consent} onChange={(e) => setConsent(e.target.checked)} required type="checkbox" />
            <span id="login-consent-copy">
              <a href="/kvkk" target="_blank" rel="noreferrer">KVKK Aydınlatma Metni</a>
              {" ve "}
              <a href="/gizlilik" target="_blank" rel="noreferrer">Gizlilik Politikası</a>
              {"'nı okudum ve kabul ediyorum."}
            </span>
          </label>
          <p className={styles.accountNote}>
            <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>
            {" · "}
            <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a>
          </p>
          <Message error={error} />
          <button className={styles.primary} disabled={busy || !consent} type="submit">{busy ? "Kod gönderiliyor…" : "Kodu gönder"}</button>
        </form>
      ) : (
        <form onSubmit={verifyOtp}>
          <p className={styles.eyebrow}>DOĞRULAMA</p>
          <h1 className={styles.title}>Kodunuzu girin</h1>
          <p className={styles.otpEmail}><strong>{email.trim().toLowerCase()}</strong> adresine gönderilen 6 haneli kodu girin.</p>
          <div className={styles.delivery} role="status">
            <div><strong>Doğrulama kodu gönderildi</strong><p>Ulaşmazsa Spam / Junk klasörünü de kontrol edin.</p></div>
          </div>
          <label className={styles.fieldLabel} htmlFor="login-otp">Doğrulama kodu</label>
          <input ref={codeRef} aria-describedby="otp-hint" autoComplete="one-time-code" className={`${styles.input} ${styles.otpInput}`} disabled={busy} id="login-otp" inputMode="numeric" maxLength={6} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" placeholder="000000" value={code} />
          <div className={styles.otpMeta}><button className={styles.textAction} onClick={() => { setStep("email"); setCode(""); setError(null); }} type="button">E-posta adresini değiştir</button><small className={styles.otpHint} id="otp-hint">6 haneli kod</small></div>
          {devOtp ? <p className={styles.accountNote}>Development kodu: <span>{devOtp}</span></p> : null}
          <Message error={error} />
          <button className={styles.primary} disabled={busy || code.length !== 6} type="submit">{busy ? "Doğrulanıyor…" : "Doğrula ve devam et"}</button>
          <button className={styles.resend} disabled={busy || seconds > 0} onClick={() => void requestOtp()} type="button">{busy ? "Kod gönderiliyor…" : seconds > 0 ? `Kodu tekrar gönder (${seconds} sn)` : "Kodu tekrar gönder"}</button>
        </form>
      )}
    </AuthShell>
  );
}

function Toast({ toast, onDismiss }: { toast: { kind: "success" | "error"; message: string } | null; onDismiss: () => void }) {
  if (!toast) return null;
  return (
    <div aria-atomic="true" aria-live={toast.kind === "error" ? "assertive" : "polite"} className={`${styles.toast} ${toast.kind === "error" ? styles.toastError : ""}`} role={toast.kind === "error" ? "alert" : "status"}>
      <span className={styles.toastText}>{toast.message}</span>
      <button aria-label="Bildirimi kapat" className={styles.toastClose} onClick={onDismiss} type="button">×</button>
    </div>
  );
}

function Message({ error }: { error: string | null }) {
  return error ? <p aria-live="polite" className={styles.message}>{error}</p> : null;
}
