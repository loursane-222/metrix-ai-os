"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { executiveNavigationCommandRuntime, normalizePathname, registerExecutiveNavigationHandler } from "@/lib/conversation-extensions/conversation-navigation-runtime";
import { executeUniversalInputBatch, inputPresenceRuntime, universalInputAuthorityHost, universalInputRegistry } from "@/lib/input-authority";

export function ExecutiveNavigationCommandHost() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const command = useSyncExternalStore(executiveNavigationCommandRuntime.subscribe, executiveNavigationCommandRuntime.getSnapshot, () => null);
  const registrySnapshot = useSyncExternalStore(universalInputRegistry.subscribe, universalInputRegistry.getSnapshot, universalInputRegistry.getSnapshot);
  useEffect(() => { for (const targetId of Object.keys(inputPresenceRuntime.getSnapshot())) if (!universalInputRegistry.getByTargetId(targetId)) inputPresenceRuntime.clear(targetId); }, [registrySnapshot]);
  useEffect(() => registerExecutiveNavigationHandler((next) => {
    if (normalizePathname(pathnameRef.current) === normalizePathname(next.route)) return;
    try { router.push(next.route, { scroll: false }); }
    catch (cause: unknown) {
      console.error("[ExecutiveNavigationCommandHost] router push failed", {
        stage: "router-push",
        errorName: cause instanceof Error && /^(?:Error|[A-Za-z][A-Za-z0-9]*Error)$/.test(cause.name) ? cause.name : "UnknownError",
        errorMessage: "Router push failed",
        commandId: next.commandId,
        generation: next.generation,
        requestedRoute: next.route,
        currentPathname: pathnameRef.current,
      });
      throw cause;
    }
  }), [router]);
  useEffect(() => {
    if (!command || command.state !== "NAVIGATING") return;
    executiveNavigationCommandRuntime.acknowledgeRoute(command.commandId, command.generation, pathname);
  }, [command, pathname]);
  useEffect(() => {
    if (!command || command.state !== "WAITING_FOR_SURFACE") return;
    const matches = universalInputRegistry.getByAuthorityKey(command.expectedSurfaceAuthorityKey);
    const destination = matches.find(({ descriptor }) => descriptor.mounted !== false && descriptor.visibility !== "hidden" && descriptor.active !== false && (!command.expectedExecutiveTargetId || descriptor.executiveTargetId === command.expectedExecutiveTargetId));
    if (!destination || !executiveNavigationCommandRuntime.transition(command.commandId, command.generation, "CLAIMED")) return;
    void apply(command.commandId, command.generation);
  }, [command, registrySnapshot]);
  return <InputPresenceProjection />;
}

async function apply(commandId: string, generation: number): Promise<void> {
  const command = executiveNavigationCommandRuntime.getSnapshot();
  if (!command || !executiveNavigationCommandRuntime.isCurrent(commandId, generation)) return;
  executiveNavigationCommandRuntime.transition(commandId, generation, "APPLYING");
  const targetIds = command.batch?.flatMap((item) => item.executiveTargetId ? [item.executiveTargetId] : []) ?? [];
  inputPresenceRuntime.set(targetIds, "applying");
  const result = await executeUniversalInputBatch({ commands: command.batch ?? [], expectedSurfaceAuthorityKey: command.expectedSurfaceAuthorityKey, registry: universalInputRegistry, host: universalInputAuthorityHost, finalFocusTargetId: command.finalFocusTargetId, isCurrent: () => executiveNavigationCommandRuntime.isCurrent(commandId, generation) });
  if (!executiveNavigationCommandRuntime.isCurrent(commandId, generation)) return;
  const failures = result.outcomes.filter((outcome) => outcome.status !== "EXECUTED");
  inputPresenceRuntime.set(result.changedExecutiveTargetIds, "applied");
  inputPresenceRuntime.set(failures.map((item) => item.executiveTargetId).filter(Boolean), "error");
  if (result.finalFocusTargetId) {
    const registration = universalInputRegistry.getByTargetId(result.finalFocusTargetId);
    if (registration) {
      await universalInputAuthorityHost.execute({ type: "REVEAL", executiveTargetId: result.finalFocusTargetId, expectedRegistrationToken: registration.registrationToken, expectedGeneration: registration.generation });
      if (executiveNavigationCommandRuntime.isCurrent(commandId, generation)) await universalInputAuthorityHost.execute({ type: "FOCUS", executiveTargetId: result.finalFocusTargetId, expectedRegistrationToken: registration.registrationToken, expectedGeneration: registration.generation });
    }
  } else {
    await universalInputAuthorityHost.execute({ type: "REVEAL_SURFACE", executiveTargetId: command.expectedExecutiveTargetId ?? universalInputRegistry.getByAuthorityKey(command.expectedSurfaceAuthorityKey)[0]?.descriptor.executiveTargetId });
  }
  if (!executiveNavigationCommandRuntime.isCurrent(commandId, generation)) return;
  if (failures.length) executiveNavigationCommandRuntime.finish(commandId, generation, "FAILED", result.changedExecutiveTargetIds, "Bazı alanlar hedef forma uygulanamadı.");
  else executiveNavigationCommandRuntime.finish(commandId, generation, "COMPLETED", result.changedExecutiveTargetIds);
}

function InputPresenceProjection() {
  const snapshot = useSyncExternalStore(inputPresenceRuntime.subscribe, inputPresenceRuntime.getSnapshot, getEmptyPresenceSnapshot);
  useEffect(() => {
    const projected: Array<{ element: HTMLElement; value: string }> = [];
    for (const [targetId, phase] of Object.entries(snapshot)) {
      const element = document.querySelector<HTMLElement>(`[data-executive-target="${CSS.escape(targetId)}"]`);
      if (!element) continue;
      const value = phase === "error" ? "validation-error" : phase === "applied" ? "applied-mutation" : "pending-mutation";
      element.dataset.executiveFocus = value; projected.push({ element, value });
    }
    return () => { for (const { element, value } of projected) if (element.dataset.executiveFocus === value) delete element.dataset.executiveFocus; };
  }, [snapshot]);
  return <div aria-live="polite" className="sr-only">{Object.values(snapshot).includes("applied") ? "Alanlar güncellendi." : ""}</div>;
}
const EMPTY_PRESENCE_SNAPSHOT = Object.freeze({});
function getEmptyPresenceSnapshot() { return EMPTY_PRESENCE_SNAPSHOT; }
