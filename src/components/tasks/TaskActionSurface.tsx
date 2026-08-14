"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { executeTaskCompleteAction, listTasks, type TaskRecord } from "@/lib/tasks/tasks-client";
import type { TaskEditCommandExecutionResult } from "@/lib/tasks/task-edit-command-contract";
import { registerTaskEditSurfaceTarget, unregisterTaskEditSurfaceTarget } from "@/lib/tasks/task-edit-surface-command-channel";

const PRIORITY: Record<string, string> = { LOW: "Düşük", MEDIUM: "Orta", HIGH: "Yüksek" };
const STATUS: Record<string, string> = { OPEN: "Açık", DONE: "Tamamlandı", CANCELLED: "İptal" };

export function TaskActionSurface({ taskId, onReady, onFailure }: { taskId: string; onReady?: () => void; onFailure?: () => void }) {
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const result = await listTasks();
    if (!result.ok) { setError(result.error); onFailure?.(); return; }
    const match = result.data.tasks.find((record) => record.id === taskId);
    if (!match) { setError("Görev bulunamadı."); onFailure?.(); return; }
    setTask(match); setError(null); onReady?.();
  }, [taskId, onFailure, onReady]);
  useEffect(() => { void load(); }, [load]);
  const complete = useCallback(async (): Promise<string | null> => {
    setBusy(true); setError(null);
    const result = await executeTaskCompleteAction(taskId);
    if (result.ok) { await load(); setBusy(false); return null; }
    setError(result.error); setBusy(false); return result.error;
  }, [taskId, load]);
  useEffect(() => {
    const runtime = { getState: () => ({ activeTab: "actions" as const }), applyCommand: async (): Promise<TaskEditCommandExecutionResult> => { const commandError = await complete(); return commandError ? { status: "EXECUTION_FAILED", error: commandError } : { status: "EXECUTED", command: { type: "complete" } }; } };
    const token = registerTaskEditSurfaceTarget({ entityId: taskId, runtime });
    return () => unregisterTaskEditSurfaceTarget(token);
  }, [taskId, complete]);
  if (!task && !error) return <p className="py-12 text-center text-sm text-[#7C7466]">Görev yükleniyor…</p>;
  if (!task) return <Message error={error ?? "Görev bulunamadı."} />;
  return <div className="mx-auto max-w-5xl space-y-4 pb-8" data-task-action-surface={task.id}>
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[.18em] text-[#7C7466]">Görev çalışma alanı</p><h2 className="mt-1 text-xl font-semibold text-[#EDE7D9]">{task.title}</h2>{task.description ? <p className="mt-1 text-sm text-[#A79F91]">{task.description}</p> : null}</div><Badge>{STATUS[task.status] ?? task.status}</Badge></header>
    {error ? <Message error={error} /> : null}
    <Card title="Görev bilgileri"><dl className="grid gap-4 sm:grid-cols-2"><Fact label="Vade tarihi" value={formatDate(task.dueDate)}/><Fact label="Öncelik" value={PRIORITY[task.priority] ?? task.priority}/></dl></Card>
    <Card title="Görev aksiyonları">{task.status === "OPEN" ? <Action disabled={busy} onClick={() => void complete()}>{busy ? "Tamamlanıyor…" : "Görevi Tamamla"}</Action> : <p className="text-sm text-[#7C7466]">Bu görevde başka aksiyon yok.</p>}</Card>
  </div>;
}

function Card({ title, children }: { title: string; children: ReactNode }) { return <section className="rounded-[20px] border border-white/[.08] bg-white/[.035] p-4"><h3 className="mb-3 text-sm font-semibold text-[#EDE7D9]">{title}</h3>{children}</section>; }
function Fact({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs font-medium text-[#A79F91]">{label}</dt><dd className="mt-1.5 break-words text-sm text-[#EDE7D9]">{value}</dd></div>; }
function Action({ children, disabled, onClick }: { children: ReactNode; disabled: boolean; onClick: () => void }) { return <button className="rounded-xl bg-[#34e6cf] px-4 py-2.5 text-sm font-bold text-[#14120F] disabled:opacity-40" disabled={disabled} onClick={onClick} type="button">{children}</button>; }
function Badge({ children }: { children: ReactNode }) { return <span className="rounded-full border border-[#C9BFA8]/20 bg-[#C9BFA8]/10 px-3 py-1.5 text-xs font-semibold text-[#C9BFA8]">{children}</span>; }
function Message({ error }: { error: string }) { return <p className="rounded-xl border border-[#f16a7a]/20 bg-[#f16a7a]/10 p-3 text-sm text-[#f16a7a]" role="alert">{error}</p>; }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(value)) : "Vade tanımlanmamış"; }
