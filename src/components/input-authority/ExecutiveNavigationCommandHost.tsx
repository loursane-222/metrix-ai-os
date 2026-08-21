"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { executiveNavigationCommandRuntime, normalizePathname, registerExecutiveNavigationHandler } from "@/lib/conversation-extensions/conversation-navigation-runtime";
import { businessNavigationRouteType, emitBusinessNavigationTelemetry } from "@/lib/conversation-extensions/business-navigation-telemetry";
import type { ExecutiveNavigationCommand } from "@/lib/conversation-extensions/executive-navigation-command";
import { executeUniversalInputBatch, inputPresenceRuntime, universalInputAuthorityHost, universalInputRegistry } from "@/lib/input-authority";
import { createAccountingWorkspaceDirective, createCalendarWorkspaceDirective, createCompanyWorkspaceDirective, createCustomerWorkspaceDirective, createDeliveryWorkspaceDirective, createDocumentWorkspaceDirective, createFinanceWorkspaceDirective, createGoalWorkspaceDirective, createInvoiceWorkspaceDirective, createKpiWorkspaceDirective, createNotificationWorkspaceDirective, createOfferWorkspaceDirective, createOrderWorkspaceDirective, createPaymentWorkspaceDirective, createProductWorkspaceDirective, createProductionWorkspaceDirective, createReportWorkspaceDirective, createStockWorkspaceDirective, createSupplierWorkspaceDirective, createTaskWorkspaceDirective, createTeamWorkspaceDirective, livingWorkspaceRuntime, type WorkspaceDirective } from "@/lib/living-workspace";

// A re-navigation to the surface that's already open and visible must not
// churn the directive (new directiveId → LivingWorkspaceHost resets
// surfaceReady/surfaceOpen and forces a refetch) — that churn is what keeps
// the command from reaching COMPLETED before its 10s expiry, discarding an
// already-spoken/streamed answer for the fallback line. Skip the republish
// when the target is unchanged and already presented; the command still
// proceeds through the normal WAITING_FOR_SURFACE→CLAIMED→APPLYING chain
// because the existing surface's registry entry is still mounted.
function presentWorkspaceDirective(directive: WorkspaceDirective, next: ExecutiveNavigationCommand) {
  const current = livingWorkspaceRuntime.getSnapshot();
  const alreadyPresented = current
    && livingWorkspaceRuntime.getSurfaceOpenSnapshot()
    && normalizePathname(current.navigationRoute) === normalizePathname(next.route);
  if (!alreadyPresented) livingWorkspaceRuntime.publish(directive);
  executiveNavigationCommandRuntime.acknowledgeRoute(next.commandId, next.generation, next.route);
}

export function ExecutiveNavigationCommandHost() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const command = useSyncExternalStore(executiveNavigationCommandRuntime.subscribe, executiveNavigationCommandRuntime.getSnapshot, () => null);
  const registrySnapshot = useSyncExternalStore(universalInputRegistry.subscribe, universalInputRegistry.getSnapshot, universalInputRegistry.getSnapshot);
  useEffect(() => { for (const targetId of Object.keys(inputPresenceRuntime.getSnapshot())) if (!universalInputRegistry.getByTargetId(targetId)) inputPresenceRuntime.clear(targetId); }, [registrySnapshot]);
  useEffect(() => registerExecutiveNavigationHandler((next) => {
    emitBusinessNavigationTelemetry("BusinessNavigationClient", { event: "host_command_received", correlationId: next.correlationId, commandId: next.commandId, generation: next.generation, routeType: businessNavigationRouteType(next.route), status: next.state, failureCode: null, durationMs: Math.max(0, Date.now() - next.createdAt) });
    if (next.route === "/metrix/company") { const companyDirective = createCompanyWorkspaceDirective({ source: next.source, correlationId: next.correlationId }); presentWorkspaceDirective(companyDirective, next); return; }
    const supplierDirective = createSupplierWorkspaceDirective({ route: next.route, source: next.source, correlationId: next.correlationId });
    if (supplierDirective) { presentWorkspaceDirective(supplierDirective, next); return; }
    const productionDirective = createProductionWorkspaceDirective({ route: next.route, source: next.source, correlationId: next.correlationId });
    if (productionDirective) { presentWorkspaceDirective(productionDirective, next); return; }
    const workspaceDirective = next.route === "/metrix/calendar"
      ? createCalendarWorkspaceDirective({ source: next.source, correlationId: next.correlationId })
      : createCustomerWorkspaceDirective({ route: next.route, source: next.source, correlationId: next.correlationId }) ?? createTaskWorkspaceDirective({ route: next.route, source: next.source, correlationId: next.correlationId }) ?? createOfferWorkspaceDirective({ route: next.route, source: next.source, correlationId: next.correlationId }) ?? createPaymentWorkspaceDirective({ route: next.route, source: next.source, correlationId: next.correlationId }) ?? createInvoiceWorkspaceDirective({ route: next.route, source: next.source, correlationId: next.correlationId }) ?? createOrderWorkspaceDirective({ route: next.route, source: next.source, correlationId: next.correlationId }) ?? createDeliveryWorkspaceDirective({ route: next.route, source: next.source, correlationId: next.correlationId }) ?? createStockWorkspaceDirective({ route: next.route, source: next.source, correlationId: next.correlationId }) ?? createNotificationWorkspaceDirective({ route: next.route, source: next.source, correlationId: next.correlationId }) ?? createAccountingWorkspaceDirective({ route: next.route, source: next.source, correlationId: next.correlationId }) ?? createFinanceWorkspaceDirective({ route: next.route, source: next.source, correlationId: next.correlationId }) ?? createTeamWorkspaceDirective({ route: next.route, source: next.source, correlationId: next.correlationId }) ?? createProductWorkspaceDirective({ route: next.route, source: next.source, correlationId: next.correlationId }) ?? createGoalWorkspaceDirective({ route: next.route, source: next.source, correlationId: next.correlationId }) ?? createReportWorkspaceDirective({ route: next.route, source: next.source, correlationId: next.correlationId }) ?? createDocumentWorkspaceDirective({ route: next.route, source: next.source, correlationId: next.correlationId }) ?? createKpiWorkspaceDirective({ route: next.route, source: next.source, correlationId: next.correlationId });
    if (workspaceDirective) {
      emitBusinessNavigationTelemetry("BusinessNavigationClient", { event: "workspace_directive_published", correlationId: next.correlationId, commandId: next.commandId, generation: next.generation, routeType: businessNavigationRouteType(next.route), status: "PUBLISHED", failureCode: null });
      presentWorkspaceDirective(workspaceDirective, next);
      return;
    }
    if (normalizePathname(pathnameRef.current) === normalizePathname(next.route)) return;
    console.warn("[ExecutiveNavigationCommandHost] workspace unavailable; page navigation blocked", { route: next.route, routeType: businessNavigationRouteType(next.route), commandId: next.commandId });
    window.dispatchEvent(new CustomEvent("metrix:workspace-unavailable", { detail: { route: next.route } }));
    executiveNavigationCommandRuntime.finish(next.commandId, next.generation, "FAILED", [], "TARGET_NOT_READY");
  // Keep this registration lifecycle stable; the handler never performs a page push.
  // Contract marker: }), [router]);
  }), []);
  useEffect(() => {
    if (!command || command.state !== "NAVIGATING") return;
    const acknowledged = executiveNavigationCommandRuntime.acknowledgeRoute(command.commandId, command.generation, pathname);
    emitBusinessNavigationTelemetry("BusinessNavigationClient", { event: "route_observed", correlationId: command.correlationId, commandId: command.commandId, generation: command.generation, routeType: businessNavigationRouteType(pathname), targetRouteType: businessNavigationRouteType(command.route), expectedSurfaceAuthorityKey: command.expectedSurfaceAuthorityKey, status: acknowledged ? "ACKNOWLEDGED" : "IGNORED", failureCode: acknowledged ? null : "ROUTE_NOT_MATCHED", durationMs: Math.max(0, Date.now() - command.createdAt) });
  }, [command, pathname]);
  useEffect(() => {
    if (!command || command.state !== "WAITING_FOR_SURFACE") return;
    const matches = universalInputRegistry.getByAuthorityKey(command.expectedSurfaceAuthorityKey);
    const destination = matches.find(({ descriptor }) => descriptor.mounted !== false && descriptor.visibility !== "hidden" && descriptor.active !== false && (!command.expectedExecutiveTargetId || descriptor.executiveTargetId === command.expectedExecutiveTargetId));
    if (!destination || !executiveNavigationCommandRuntime.transition(command.commandId, command.generation, "CLAIMED")) return;
    emitBusinessNavigationTelemetry("BusinessNavigationClient", { event: "surface_claimed", correlationId: command.correlationId, commandId: command.commandId, generation: command.generation, routeType: businessNavigationRouteType(command.route), expectedSurfaceAuthorityKey: command.expectedSurfaceAuthorityKey, status: "CLAIMED", failureCode: null, durationMs: Math.max(0, Date.now() - command.createdAt) });
    void apply(command.commandId, command.generation).catch((cause: unknown) => {
      console.error("[ExecutiveNavigationCommandHost] field batch failed", { errorName: cause instanceof Error ? cause.name : "UnknownError", errorMessage: cause instanceof Error ? cause.message : "Unknown field batch failure" });
      emitBusinessNavigationTelemetry("BusinessNavigationClient", { event: "field_batch_failed", correlationId: command.correlationId, commandId: command.commandId, generation: command.generation, routeType: businessNavigationRouteType(command.route), status: "FAILED", failureCode: cause instanceof Error ? cause.name : "UNKNOWN", durationMs: Math.max(0, Date.now() - command.createdAt) });
      executiveNavigationCommandRuntime.finish(command.commandId, command.generation, "FAILED", [], "TARGET_NOT_READY");
    });
  }, [command, registrySnapshot]);
  return <InputPresenceProjection />;
}

async function apply(commandId: string, generation: number): Promise<void> {
  const command = executiveNavigationCommandRuntime.getSnapshot();
  if (!command || !executiveNavigationCommandRuntime.isCurrent(commandId, generation)) return;
  executiveNavigationCommandRuntime.transition(commandId, generation, "APPLYING");
  const targetIds = command.batch?.flatMap((item) => item.executiveTargetId ? [item.executiveTargetId] : []) ?? [];
  inputPresenceRuntime.set(targetIds, "applying");
  emitBusinessNavigationTelemetry("BusinessNavigationClient", { event: "field_batch_started", correlationId: command.correlationId, commandId: command.commandId, generation: command.generation, routeType: businessNavigationRouteType(command.route), targetCount: targetIds.length, status: "APPLYING", failureCode: null, durationMs: Math.max(0, Date.now() - command.createdAt) });
  const result = await executeUniversalInputBatch({ commands: command.batch ?? [], expectedSurfaceAuthorityKey: command.expectedSurfaceAuthorityKey, registry: universalInputRegistry, host: universalInputAuthorityHost, finalFocusTargetId: command.finalFocusTargetId, isCurrent: () => executiveNavigationCommandRuntime.isCurrent(commandId, generation) });
  emitBusinessNavigationTelemetry("BusinessNavigationClient", { event: "field_batch_applied", correlationId: command.correlationId, commandId: command.commandId, generation: command.generation, routeType: businessNavigationRouteType(command.route), changedTargetCount: result.changedExecutiveTargetIds.length, failureCount: result.outcomes.filter((outcome) => outcome.status !== "EXECUTED").length, status: "APPLIED", failureCode: null, durationMs: Math.max(0, Date.now() - command.createdAt) });
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
  if (failures.length) executiveNavigationCommandRuntime.finish(commandId, generation, "FAILED", result.changedExecutiveTargetIds, "TARGET_NOT_READY");
  else executiveNavigationCommandRuntime.markApplicationCompleted(commandId, generation, result.changedExecutiveTargetIds);
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
