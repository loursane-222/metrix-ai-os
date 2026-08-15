type Result<T> = { ok: true; data: T } | { ok: false; error: string };
async function request<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const response = await fetch(path, { credentials: "include", cache: "no-store", ...init });
    const json = await response.json() as { ok?: boolean; data?: T; error?: { message?: string } };
    return response.ok && json.ok && json.data ? { ok: true, data: json.data } : { ok: false, error: json.error?.message ?? "Şirket komut işlemi tamamlanamadı." };
  } catch { return { ok: false, error: "Bağlantı kurulamadı." }; }
}
export function resolveCompanyProfileEditCommandRequest(payload: { utterance: string; activeTab: string }): Promise<Result<{ outcome: unknown }>> { return request("/api/company/actions/profile-edit-command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); }
export function resolveCompanyProfileCandidateCommandRequest(payload: { utterance: string; activeTab: string }): Promise<Result<{ outcome: unknown }>> { return request("/api/company/actions/profile-candidate-command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); }
export function resolveCompanyUnitActionCommandRequest(payload: { utterance: string }): Promise<Result<{ outcome: unknown }>> { return request("/api/company/actions/unit-action-command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); }
export function resolveCompanyUnitFormCommandRequest(payload: { utterance: string }): Promise<Result<{ outcome: unknown }>> { return request("/api/company/actions/unit-form-command", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); }
