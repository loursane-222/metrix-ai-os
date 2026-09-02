"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode } from "react";
import { buildTaskRoute } from "@/lib/tasks/task-navigation";
import { useTaskCreateSurfaceRuntime } from "@/lib/tasks/use-task-create-surface-runtime";
import { useUniversalInputRegistrations, type UniversalRegistrationInput } from "@/components/input-authority";
import { HandoffNotice } from "@/components/executive-signatures/SignatureComponents";
import { createTaskWorkspaceDirective, livingWorkspaceRuntime } from "@/lib/living-workspace";

export function TaskCreateScreen({ presentation = "route" }: { presentation?: "route" | "living" }) {
  const router = useRouter();
  const { state, execute } = useTaskCreateSurfaceRuntime();
  const form = state.draft;

  function set(field: keyof typeof form, value: unknown) {
    void execute({ type: "set_field", field, value });
  }

  useUniversalInputRegistrations([
    { descriptor: { executiveTargetId: "surface.tasks.create.form", authorityKey: "tasks.task.create", targetKind: "surface", surfaceType: "form", module: "tasks", entityType: "Task", label: "Görev oluşturma formu", readable: true, mutable: true, supportsDraft: false, visibility: "visible", active: true, mounted: true, order: 0 }, adapter: { validate: () => ({ valid: form.title.trim().length > 0, missing: !form.title.trim(), message: "Görev başlığı gerekli." }), commit: () => execute({ type: "commit" }), cancel: () => undefined } },
    { descriptor: { executiveTargetId: "field.tasks.create.task.title", authorityKey: "tasks.task.title", targetKind: "field", surfaceType: "form", module: "tasks", entityType: "Task", label: "Başlık", parentTargetId: "surface.tasks.create.form", readable: true, mutable: true, visibility: "visible", active: true, mounted: true, order: 1 }, adapter: { read: () => form.title, set: (value: unknown) => set("title", value) } },
    { descriptor: { executiveTargetId: "field.tasks.create.task.description", authorityKey: "tasks.task.description", targetKind: "field", surfaceType: "form", module: "tasks", entityType: "Task", label: "Açıklama", parentTargetId: "surface.tasks.create.form", readable: true, mutable: true, visibility: "visible", active: true, mounted: true, order: 2 }, adapter: { read: () => form.description ?? "", set: (value: unknown) => set("description", value) } },
    { descriptor: { executiveTargetId: "field.tasks.create.task.dueDate", authorityKey: "tasks.task.dueDate", targetKind: "field", surfaceType: "form", module: "tasks", entityType: "Task", label: "Vade", parentTargetId: "surface.tasks.create.form", readable: true, mutable: true, visibility: "visible", active: true, mounted: true, order: 3 }, adapter: { read: () => form.dueDate ?? "", set: (value: unknown) => set("dueDate", value) } },
    { descriptor: { executiveTargetId: "field.tasks.create.task.priority", authorityKey: "tasks.task.priority", targetKind: "field", surfaceType: "form", module: "tasks", entityType: "Task", label: "Öncelik", parentTargetId: "surface.tasks.create.form", readable: true, mutable: true, visibility: "visible", active: true, mounted: true, order: 4 }, adapter: { read: () => form.priority ?? "MEDIUM", set: (value: unknown) => set("priority", value) } },
  ] satisfies readonly UniversalRegistrationInput[]);

  async function save() {
    const outcome = await execute({ type: "commit" });
    if (outcome.navigation && presentation === "route") router.replace(buildTaskRoute(outcome.navigation));
  }

  return (
    <PageHeaderShell presentation={presentation}>
      {state.result ? <HandoffNotice status="completed" title="Görev gerçek kayda dönüştürüldü; takip alanına alındı." onRecall={() => livingWorkspaceRuntime.publish(createTaskWorkspaceDirective({ route: "/metrix/tasks", source: "written", correlationId: crypto.randomUUID() })!)} /> : null}
      <div className="grid gap-3">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-[#7C7466]">Başlık</span>
          <input
            data-executive-target="field.tasks.create.task.title"
            className="mt-1 w-full rounded-xl border border-white/[.08] bg-white/[.04] px-3 py-2 text-sm text-[#f4f7f8]"
            value={form.title}
            onChange={(event) => set("title", event.target.value)}
            placeholder="Görev başlığı"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-[#7C7466]">Açıklama</span>
          <textarea
            data-executive-target="field.tasks.create.task.description"
            className="mt-1 w-full rounded-xl border border-white/[.08] bg-white/[.04] px-3 py-2 text-sm text-[#f4f7f8]"
            value={form.description ?? ""}
            onChange={(event) => set("description", event.target.value)}
            placeholder="Opsiyonel detay"
            rows={3}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-[#7C7466]">Vade</span>
            <input
              type="date"
              data-executive-target="field.tasks.create.task.dueDate"
              className="mt-1 w-full rounded-xl border border-white/[.08] bg-white/[.04] px-3 py-2 text-sm text-[#f4f7f8]"
              value={form.dueDate ?? ""}
              onChange={(event) => set("dueDate", event.target.value || undefined)}
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-[#7C7466]">Öncelik</span>
            <select
              data-executive-target="field.tasks.create.task.priority"
              className="mt-1 w-full rounded-xl border border-white/[.08] bg-white/[.04] px-3 py-2 text-sm text-[#f4f7f8]"
              value={form.priority ?? "MEDIUM"}
              onChange={(event) => set("priority", event.target.value)}
            >
              <option value="LOW">Düşük</option>
              <option value="MEDIUM">Orta</option>
              <option value="HIGH">Yüksek</option>
            </select>
          </label>
        </div>
      </div>
      {/* Same presentation-aware offset fix as CustomerCreateScreen: bottom-24
          exists to clear a route-mode bottom nav; living mode has none, and a
          flat bottom-24 there stuck the footer across the last fields. */}
      <div className={`sticky ${presentation === "route" ? "bottom-24" : "bottom-0"} mt-5 flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-[#0f1319]/95 p-3.5 backdrop-blur-xl`}>
        <p className="flex-1 text-center text-[10px] text-[#5c6673]">{state.error ?? "Kaydetmek için başlık girin."}</p>
        <button
          className="rounded-xl border border-[#C9BFA8]/20 bg-[#C9BFA8]/10 px-4 py-2 text-xs font-semibold text-[#C9BFA8] disabled:opacity-50"
          disabled={state.submitting}
          onClick={() => void save()}
          type="button"
        >
          {state.submitting ? "Kaydediliyor..." : "Oluştur"}
        </button>
      </div>
    </PageHeaderShell>
  );
}

// Living mode must not declare its own overflow-y-auto/h-full — LivingWorkspaceHost
// already owns a single min-h-0 flex-1 overflow-y-auto scroll region around this
// whole surface, and a nested one here can't resolve against a flex-grown, not
// fixed-height, ancestor, so the outer region ends up doing all the scrolling instead.
function PageHeaderShell({ children, presentation }: { children: ReactNode; presentation: "route" | "living" }) {
  if (presentation === "living") return <div className="mx-auto w-full max-w-3xl px-1 pb-6">{children}</div>;
  return (
    <div className="relative h-dvh max-h-dvh overflow-hidden bg-[#0a0d12] text-[#f4f7f8] [color-scheme:dark]">
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-4 md:max-w-3xl md:px-8" style={{ paddingTop: "calc(20px + env(safe-area-inset-top))" }}>
        <header className="flex shrink-0 items-center justify-between py-1">
          <Link className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[#e3e8eb]" href="/metrix/tasks">‹</Link>
          <p className="text-sm font-bold text-[#f4f7f8]">Yeni Görev</p>
          <span className="w-9" />
        </header>
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
          <div style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}>{children}</div>
        </div>
      </div>
    </div>
  );
}
