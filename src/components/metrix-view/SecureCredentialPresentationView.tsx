"use client";

import { useState } from "react";

import type { SecureCredentialView } from "../../lib/presentation/contracts";
import { PRESENTATION_SURFACE_CLASS } from "./presentation-surface";

type Phase =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done"; tone: "ok" | "warn" | "error"; message: string };

// Sent back into the conversation after a successful connect so the
// Executive reads the real status and explains it. Fixed text: it contains
// no credential and nothing derived from the field.
const CONNECTED_FOLLOW_UP =
  "Erişim anahtarını güvenli alana girdim. Bağlantının ve verilerin hazırlanma durumunu söyler misin?";

// Only fixed, user-facing sentences are ever rendered. A server body is
// read for its status/code and never displayed, so nothing a provider or
// server returned can surface in the UI.
function outcomeMessage(
  status: number,
  body: { code?: unknown; sync?: { status?: unknown; products?: unknown; warehouses?: unknown } } | null
): { tone: "ok" | "warn" | "error"; message: string } {
  if (status === 200 && body?.sync?.status === "SYNCED") {
    return {
      tone: "ok",
      message: `Bağlantı kuruldu; ${Number(body.sync.products ?? 0)} ürün ve ${Number(body.sync.warehouses ?? 0)} depo hazırlandı.`
    };
  }

  if (status === 200) {
    return {
      tone: "warn",
      message: "Bağlantı kuruldu, ancak veri hazırlığı tamamlanamadı. Tekrar deneyebiliriz."
    };
  }

  if (body?.code === "BIZIMHESAP_CREDENTIALS_REJECTED") {
    return {
      tone: "error",
      message: "Erişim anahtarını doğrulayamadım. Anahtarı kontrol edip tekrar deneyebilirsin."
    };
  }

  if (body?.code === "BIZIMHESAP_PROVIDER_UNAVAILABLE") {
    return {
      tone: "error",
      message: "Sağlayıcıya şu an ulaşılamadı; bu, anahtarın yanlış olduğu anlamına gelmiyor. Biraz sonra tekrar dene."
    };
  }

  if (status === 503) {
    return {
      tone: "error",
      message: "METRIX'in bağlantı altyapısı henüz hazır değil."
    };
  }

  if (status === 401 || status === 403) {
    return { tone: "error", message: "Oturumun doğrulanamadı. Yeniden giriş yapıp tekrar dene." };
  }

  return { tone: "error", message: "Bağlantı şu an kurulamadı. Tekrar deneyebiliriz." };
}

export function SecureCredentialPresentationView({
  presentation,
  onPrompt
}: {
  presentation: SecureCredentialView;
  onPrompt?: (text: string) => void;
}) {
  // Values live only while being typed. They are cleared the moment the
  // form is submitted and are never written to storage, logs or the URL.
  const [values, setValues] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const submitting = phase.kind === "submitting";
  const complete = presentation.fields.every(field => (values[field.name] ?? "").trim().length > 0);
  const connected = phase.kind === "done" && phase.tone !== "error";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!complete || submitting || connected) return;

    const payload = Object.fromEntries(
      presentation.fields.map(field => [field.name, (values[field.name] ?? "").trim()])
    );

    setValues({});
    setPhase({ kind: "submitting" });

    let outcome: { tone: "ok" | "warn" | "error"; message: string };

    try {
      const response = await fetch(presentation.submitUrl, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      let body = null;

      try {
        body = await response.json();
      } catch {
        body = null;
      }

      outcome = outcomeMessage(response.status, body);
    } catch {
      outcome = { tone: "error", message: "Bağlantı kurulamadı; ağ hatası. Tekrar deneyebiliriz." };
    }

    setPhase({ kind: "done", ...outcome });

    if (outcome.tone !== "error") onPrompt?.(CONNECTED_FOLLOW_UP);
  }

  return (
    <section aria-label={presentation.title} className={`${PRESENTATION_SURFACE_CLASS} p-4`}>
      <h2 className="text-base font-semibold text-white">{presentation.title}</h2>
      <p className="mt-1 text-xs text-white/60">{presentation.description}</p>

      {presentation.steps.length > 0 ? (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-white/80">
          {presentation.steps.map(step => <li key={step}>{step}</li>)}
        </ol>
      ) : null}

      <p className="mt-3 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-xs text-amber-100/90">
        {presentation.secretNotice}
      </p>

      <form autoComplete="off" className="mt-3 space-y-3" onSubmit={submit}>
        {presentation.fields.map(field => (
          <label className="block text-sm text-white/70" key={field.name}>
            {field.label}
            <input
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              className="mt-1 block w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/60 disabled:opacity-50"
              data-1p-ignore
              data-lpignore="true"
              disabled={submitting || connected}
              onChange={event => setValues(current => ({ ...current, [field.name]: event.target.value }))}
              spellCheck={false}
              type="password"
              value={values[field.name] ?? ""}
            />
          </label>
        ))}

        <button
          className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-50"
          disabled={!complete || submitting || connected}
          type="submit"
        >
          {submitting ? "Doğrulanıyor…" : presentation.submitLabel}
        </button>
      </form>

      {phase.kind === "done" ? (
        <p
          className={`mt-3 text-sm ${phase.tone === "error" ? "text-red-300" : phase.tone === "warn" ? "text-amber-200" : "text-emerald-300"}`}
          role="status"
        >
          {phase.message}
        </p>
      ) : null}
    </section>
  );
}
