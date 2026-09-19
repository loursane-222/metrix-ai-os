"use client";
import { useState } from "react";

export default function ApplyPage() {
  const [message, setMessage] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  async function submit(form: FormData) { setBusy(true); setMessage(null); const response = await fetch("/api/access/applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) }); setMessage(response.ok ? "Başvurunuz alındı. İnceleme sonucu e-posta ile paylaşılacaktır." : "Bu e-posta için zaten bir başvuru veya kayıt var."); setBusy(false); }
  return <main className="access-page"><form className="access-card" action={submit}><p>METRIX</p><h1>Erişim Başvurusu</h1><span>METRIX kontrollü erişimle çalışır.</span><label>Ad soyad<input required name="name" /></label><label>Firma<input required name="company" /></label><label>İş e-postası<input required name="email" type="email" /></label><label>Telefon <input name="phone" /></label><label>Kısa not<textarea name="note" rows={3} /></label>{message ? <output role="status">{message}</output> : null}<button disabled={busy}>{busy ? "Gönderiliyor…" : "Başvuru gönder"}</button><a href="/login">Girişe dön</a></form></main>;
}
