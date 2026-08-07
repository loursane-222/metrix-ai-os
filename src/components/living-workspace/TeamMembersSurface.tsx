"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { WorkspaceSurface } from "./WorkspaceSurface";

const ROLES = ["OWNER", "EXECUTIVE", "MANAGER", "TEAM_LEAD", "EMPLOYEE"] as const;
type Role = (typeof ROLES)[number];
type Member = { id: string; email: string; fullName: string | null; role: Role; status: "ACTIVE" | "INVITED" | "DISABLED"; joinedAt: string };

export function TeamMembersSurface({ onReady, onFailure }: { onReady?: () => void; onFailure?: () => void }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/organization-members", { credentials: "include" });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error?.message ?? "Ekip bilgileri alınamadı.");
    setMembers(payload.data.members);
  }, []);
  useEffect(() => { void load().then(onReady).catch(onFailure); }, [load, onFailure, onReady]);

  async function invite(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice(null);
    const response = await fetch("/api/organization-members", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role }) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok || !payload.ok) { setNotice(payload.error?.message ?? "Davet oluşturulamadı."); return; }
    setEmail(""); setNotice("Davet oluşturuldu. Üyelik ilk doğrulanmış girişte etkinleşecek."); await load();
  }

  async function patch(memberId: string, body: { role?: Role; disabled?: boolean }) {
    setBusy(true); setNotice(null);
    const response = await fetch(`/api/organization-members/${memberId}`, { method: "PATCH", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json(); setBusy(false);
    if (!response.ok || !payload.ok) { setNotice(payload.error?.message ?? "Üye güncellenemedi."); return; }
    await load();
  }

  if (members === null) return <WorkspaceSurface title="Ekip Yönetimi" subtitle="Üyeler hazırlanıyor…"><p className="workspace-empty">Yükleniyor…</p></WorkspaceSurface>;
  return <div className="mx-auto max-w-5xl" data-canonical-domain="team" data-canonical-view="list">
    <WorkspaceSurface title="Ekip Yönetimi" subtitle="Davet, rol ve üyelik durumu" kpis={[{ label: "Toplam üye", value: members.length }, { label: "Aktif", value: members.filter((item) => item.status === "ACTIVE").length }, { label: "Davet bekliyor", value: members.filter((item) => item.status === "INVITED").length }]}>
      <form className="mb-5 grid gap-3 rounded-2xl border border-white/[.08] bg-white/[.025] p-4 sm:grid-cols-[1fr_180px_auto]" onSubmit={(event) => void invite(event)}>
        <label className="grid gap-1 text-xs text-[#C9BFA8]">E-posta<input aria-label="Davet e-postası" className="rounded-xl border border-white/[.1] bg-[#14120F] px-3 py-2.5 text-sm text-[#EDE7D9]" onChange={(event) => setEmail(event.target.value)} placeholder="isim@sirket.com" required type="email" value={email}/></label>
        <label className="grid gap-1 text-xs text-[#C9BFA8]">Rol<select aria-label="Davet rolü" className="rounded-xl border border-white/[.1] bg-[#14120F] px-3 py-2.5 text-sm text-[#EDE7D9]" onChange={(event) => setRole(event.target.value as Role)} value={role}>{ROLES.map((item) => <option key={item}>{item}</option>)}</select></label>
        <button className="self-end rounded-xl border border-[#C9BFA8]/25 bg-[#C9BFA8]/10 px-4 py-2.5 text-sm font-semibold text-[#C9BFA8] disabled:opacity-50" disabled={busy} type="submit">Davet et</button>
      </form>
      {notice ? <p className="mb-4 rounded-xl border border-white/[.08] px-3 py-2 text-xs text-[#C9BFA8]" role="status">{notice}</p> : null}
      <div className="workspace-record-list" role="list">{members.map((member) => <div className="workspace-record-item" key={member.id} role="listitem"><div className="grid min-w-[650px] grid-cols-[1.5fr_150px_120px_140px] items-center gap-3 px-4 py-3">
        <div><small className="block text-[#7C7466]">Üye</small><strong className="text-sm text-[#EDE7D9]">{member.fullName ?? member.email}</strong><span className="block text-xs text-[#7C7466]">{member.fullName ? member.email : ""}</span></div>
        <select aria-label={`${member.email} rolü`} className="rounded-lg border border-white/[.1] bg-[#14120F] px-2 py-2 text-xs text-[#EDE7D9]" disabled={busy} onChange={(event) => void patch(member.id, { role: event.target.value as Role })} value={member.role}>{ROLES.map((item) => <option key={item}>{item}</option>)}</select>
        <span className="text-xs font-semibold text-[#C9BFA8]">{member.status}</span>
        <button className="rounded-lg border border-white/[.1] px-3 py-2 text-xs text-[#C9BFA8] disabled:opacity-50" disabled={busy} onClick={() => void patch(member.id, { disabled: member.status !== "DISABLED" })} type="button">{member.status === "DISABLED" ? "Etkinleştir" : "Devre dışı bırak"}</button>
      </div></div>)}</div>
    </WorkspaceSurface>
  </div>;
}
