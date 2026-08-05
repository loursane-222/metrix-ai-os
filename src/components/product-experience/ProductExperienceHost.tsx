"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { CustomerCreateScreen } from "@/components/customers/CustomerCreateScreen";
import { CustomerDetailScreen } from "@/components/customers/CustomerDetailScreen";
import { executiveNavigationCommandRuntime } from "@/lib/conversation-extensions/conversation-navigation-runtime";
import { useProductExperience } from "./ProductExperienceProvider";

export function ProductExperienceHost({ conversation }: { conversation: ReactNode }) {
  const experience = useProductExperience();
  const { state } = experience;
  const experienceRef = useRef(experience);
  experienceRef.current = experience;
  const commandRef = useRef(state.activeCommand);
  commandRef.current = state.activeCommand;
  const mounted = useCallback(({ surfaceInstanceId }: { surfaceInstanceId: string }) => experienceRef.current.acknowledgeMounted({ surfaceInstanceId }), []);
  const ready = useCallback(({ surfaceInstanceId }: { surfaceInstanceId: string }) => {
    const active = commandRef.current;
    if (!active || active.surfaceInstanceId !== surfaceInstanceId) return;
    experienceRef.current.acknowledgeVisibleReady({ surfaceInstanceId });
    const runtime = executiveNavigationCommandRuntime.getSnapshot();
    if (!runtime || runtime.commandId !== active.commandId || runtime.state !== "APPLYING") return;
    executiveNavigationCommandRuntime.markApplicationCompleted(runtime.commandId, runtime.generation, runtime.batch?.flatMap((item) => item.executiveTargetId ? [item.executiveTargetId] : []) ?? []);
    executiveNavigationCommandRuntime.completePresented(active.correlationId, runtime.expectedSurfaceAuthorityKey);
  }, []);
  const failed = useCallback(({ surfaceInstanceId, reason }: { surfaceInstanceId: string; reason: string }) => {
    const active = commandRef.current;
    if (!active || active.surfaceInstanceId !== surfaceInstanceId) return;
    experienceRef.current.failPresentation({ surfaceInstanceId, reason });
    const runtime = executiveNavigationCommandRuntime.getSnapshot();
    if (runtime?.commandId === active.commandId) executiveNavigationCommandRuntime.failPresentation(active.correlationId, runtime.expectedSurfaceAuthorityKey);
  }, []);
  useEffect(() => {
    if (state.presentationStatus !== "mounted" || !state.activeCommand) return;
    const runtime = executiveNavigationCommandRuntime.getSnapshot();
    if (!runtime || runtime.commandId !== state.activeCommand.commandId || runtime.state !== "WAITING_FOR_SURFACE") return;
    if (executiveNavigationCommandRuntime.transition(runtime.commandId, runtime.generation, "CLAIMED")) executiveNavigationCommandRuntime.transition(runtime.commandId, runtime.generation, "APPLYING");
  }, [state.activeCommand, state.presentationStatus]);
  const surfaceInstanceId = state.activeCommand?.surfaceInstanceId;
  const conversationVisible = state.mode === "conversation";
  return <div className="relative h-full min-h-0 overflow-hidden">
    <section aria-hidden={!conversationVisible} className={`absolute inset-0 min-h-0 overflow-hidden ${conversationVisible ? "pointer-events-auto visible" : "pointer-events-none invisible"}`} inert={!conversationVisible ? true : undefined}>{conversation}</section>
    <section aria-hidden={conversationVisible} className={`absolute inset-0 z-30 min-h-0 overflow-hidden bg-[#071018] ${conversationVisible ? "pointer-events-none invisible" : "pointer-events-auto visible"}`} inert={conversationVisible ? true : undefined}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 px-3 pt-3 sm:px-5"><div className="mx-auto flex max-w-5xl items-center gap-3 rounded-[20px] border border-white/[.08] bg-white/[.035] px-3 py-2.5"><button aria-label="Sohbete Dön" className="rounded-xl border border-white/[.1] bg-white/[.04] px-3 py-2 text-xs text-[#c9d1d6]" onClick={experience.returnToConversation} type="button">Sohbete Dön</button><p className="text-sm font-bold">{state.activeSurface === "customer.create" ? "Yeni Müşteri" : "Müşteri Detayı"}</p></div></div>
        <div className="min-h-0 flex-1 overflow-hidden px-3 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3 sm:px-5">
          {state.activeSurface === "customer.detail" && state.activeEntityId && surfaceInstanceId ? <CustomerDetailScreen customerId={state.activeEntityId} onMounted={mounted} onPresentationFailure={failed} onVisibleReady={ready} presentation="embedded" surfaceInstanceId={surfaceInstanceId}/> : null}
          {state.activeSurface === "customer.create" && surfaceInstanceId ? <CustomerCreateScreen initialProjection={state.surfacePayload?.fields} onFieldsVisible={ready} onMounted={mounted} onPresentationFailure={failed} operationId={state.surfacePayload?.operationId} presentation="embedded" surfaceInstanceId={surfaceInstanceId}/> : null}
        </div>
      </div>
    </section>
    {conversationVisible && state.activeSurface ? <button className="fixed bottom-[calc(16px+env(safe-area-inset-bottom))] right-3 z-40 rounded-full border border-[#35dce3]/25 bg-[#0b161f]/96 px-4 py-3 text-xs font-semibold text-[#35dce3] shadow-xl" onClick={experience.reopenActiveSurface} type="button">Aynı çalışma bağlamını aç</button> : null}
  </div>;
}
