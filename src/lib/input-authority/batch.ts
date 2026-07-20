import type { UniversalInputAuthorityCommand, UniversalInputAuthorityExecutionResult } from "./contracts";
import { UniversalInputAuthorityHost } from "./host";
import { UniversalInputRegistry } from "./registry";

export type UniversalInputBatchFieldOutcome = Readonly<{
  executiveTargetId: string;
  status: "EXECUTED" | "MISSING" | "REJECTED" | "STALE" | "FAILED";
  authorityStatus?: UniversalInputAuthorityExecutionResult["status"];
}>;

export type UniversalInputBatchResult = Readonly<{
  outcomes: readonly UniversalInputBatchFieldOutcome[];
  changedExecutiveTargetIds: readonly string[];
  finalFocusTargetId: string | null;
}>;

export async function executeUniversalInputBatch(input: Readonly<{
  commands: readonly UniversalInputAuthorityCommand[];
  expectedSurfaceAuthorityKey: string;
  registry: UniversalInputRegistry;
  host: UniversalInputAuthorityHost;
  finalFocusTargetId?: string;
  isCurrent?: () => boolean;
}>): Promise<UniversalInputBatchResult> {
  const outcomes: UniversalInputBatchFieldOutcome[] = [];
  const changed: string[] = [];
  for (const command of input.commands) {
    const targetId = command.executiveTargetId;
    if (!targetId) { outcomes.push({ executiveTargetId: "", status: "MISSING" }); continue; }
    if (input.isCurrent && !input.isCurrent()) { outcomes.push({ executiveTargetId: targetId, status: "STALE" }); continue; }
    const registration = input.registry.getByTargetId(targetId);
    if (!registration) { outcomes.push({ executiveTargetId: targetId, status: "MISSING" }); continue; }
    const lineage = [registration.descriptor, ...input.registry.getAncestors(targetId)];
    if (!lineage.some((descriptor) => descriptor.authorityKey === input.expectedSurfaceAuthorityKey)) {
      outcomes.push({ executiveTargetId: targetId, status: "REJECTED" });
      continue;
    }
    const result = await input.host.execute({ ...command, expectedRegistrationToken: registration.registrationToken, expectedGeneration: registration.generation });
    const current = input.registry.getByTargetId(targetId);
    const disappeared = !current || current.registrationToken !== registration.registrationToken;
    const status = disappeared || input.isCurrent && !input.isCurrent() ? "STALE" : result.status === "EXECUTED" ? "EXECUTED" : result.status === "NOT_FOUND" ? "MISSING" : result.status === "STALE_TARGET" ? "STALE" : result.status === "EXECUTION_FAILED" ? "FAILED" : "REJECTED";
    outcomes.push({ executiveTargetId: targetId, status, authorityStatus: result.status });
    if (status === "EXECUTED") changed.push(targetId);
  }
  const requestedFocus = input.finalFocusTargetId;
  const finalFocusTargetId = requestedFocus && changed.includes(requestedFocus) ? requestedFocus : changed[0] ?? null;
  return Object.freeze({ outcomes: Object.freeze(outcomes), changedExecutiveTargetIds: Object.freeze(changed), finalFocusTargetId });
}
