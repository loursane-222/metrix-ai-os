"use client";

import { useEffect, useRef, useState } from "react";

import { AuthShell, authButtonClass, authInputClass } from "./AuthShell";

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
          <label className="text-xs font-semibold text-[#cfd7dc]" htmlFor="login-email">E-posta adresi</label>
          <input autoComplete="email" autoFocus className={authInputClass} disabled={busy} id="login-email" inputMode="email" onChange={(e) => setEmail(e.target.value)} placeholder="siz@sirketiniz.com" type="email" value={email} />
          <p className="mt-3 text-xs leading-5 text-[#7f8c96]">İlk girişinizse hesabınız doğrulama sonrasında otomatik oluşturulur.</p>
          <label className="mt-4 flex min-h-8 cursor-pointer items-center gap-3 text-sm text-[#93a0ad]">
            <input checked={rememberMe} className="h-4 w-4 accent-[#34e6cf]" onChange={(e) => setRememberMe(e.target.checked)} type="checkbox" />
            Bu cihazda oturumu hatırla
          </label>
          <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-5 text-[#93a0ad]">
            <input aria-describedby="login-consent-copy" checked={consent} className="mt-0.5 h-4 w-4 shrink-0 accent-[#34e6cf]" onChange={(e) => setConsent(e.target.checked)} required type="checkbox" />
            <span id="login-consent-copy">
              <a className="font-semibold text-[#34e6cf] underline underline-offset-4" href="/kvkk" target="_blank" rel="noreferrer">KVKK Aydınlatma Metni</a>
              {" ve "}
              <a className="font-semibold text-[#34e6cf] underline underline-offset-4" href="/gizlilik" target="_blank" rel="noreferrer">Gizlilik Politikası</a>
              {"'nı okudum ve kabul ediyorum."}
            </span>
          </label>
          <Message error={error} />
          <button className={authButtonClass} disabled={busy || !consent} type="submit">{busy ? "Kod gönderiliyor…" : "Kodu Gönder"}</button>
        </form>
      ) : (
        <form onSubmit={verifyOtp}>
          <div className="mb-5 rounded-xl border border-[#34e6cf]/20 bg-[#34e6cf]/[.07] px-4 py-3" role="status">
            <p className="text-sm font-semibold text-[#baf8ef]">Doğrulama kodu gönderildi.</p>
            <p className="mt-1 text-xs leading-5 text-[#93a0ad]">Kod birkaç dakika içinde ulaşmazsa Spam / Junk klasörünü de kontrol edin.</p>
          </div>
          <p className="text-sm leading-6 text-[#93a0ad]"><span className="font-semibold text-[#e3e8eb]">{email.trim().toLowerCase()}</span> adresine gönderilen kodu girin.</p>
          <button className="mt-2 text-xs font-semibold text-[#34e6cf] underline-offset-4 hover:underline" onClick={() => { setStep("email"); setCode(""); setError(null); }} type="button">E-posta adresini değiştir</button>
          <label className="mt-5 block text-xs font-semibold text-[#cfd7dc]" htmlFor="login-otp">Doğrulama kodu</label>
          <input ref={codeRef} autoComplete="one-time-code" className={`${authInputClass} text-center text-xl tracking-[0.35em]`} disabled={busy} id="login-otp" inputMode="numeric" maxLength={6} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} pattern="[0-9]{6}" value={code} />
          {devOtp ? <p className="mt-3 text-xs text-[#93a0ad]">Development kodu: <span className="font-mono text-[#e3e8eb]">{devOtp}</span></p> : null}
          <Message error={error} />
          <button className={authButtonClass} disabled={busy || code.length !== 6} type="submit">{busy ? "Doğrulanıyor…" : "Doğrula ve Devam Et"}</button>
          <button className="mt-4 w-full text-center text-xs font-semibold text-[#34e6cf] disabled:text-[#93a0ad] disabled:opacity-50" disabled={busy || seconds > 0} onClick={() => void requestOtp()} type="button">{busy ? "Kod gönderiliyor…" : seconds > 0 ? `Kodu tekrar gönder (${seconds} sn)` : "Kodu tekrar gönder"}</button>
        </form>
      )}
    </AuthShell>
  );
}

function Toast({ toast, onDismiss }: { toast: { kind: "success" | "error"; message: string } | null; onDismiss: () => void }) {
  if (!toast) return null;
  return (
    <div aria-atomic="true" aria-live={toast.kind === "error" ? "assertive" : "polite"} className={`fixed left-1/2 top-[max(18px,env(safe-area-inset-top))] z-50 flex w-[min(92vw,420px)] -translate-x-1/2 items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl ${toast.kind === "success" ? "border-[#34e6cf]/30 bg-[#08251f]/95 text-[#c8fff6]" : "border-red-400/30 bg-[#2a1014]/95 text-red-100"}`} role={toast.kind === "error" ? "alert" : "status"}>
      <span className="flex-1">{toast.message}</span>
      <button aria-label="Bildirimi kapat" className="rounded-md px-1 text-current opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current" onClick={onDismiss} type="button">×</button>
    </div>
  );
}

function Message({ error }: { error: string | null }) {
  return error ? <p aria-live="polite" className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p> : null;
}
