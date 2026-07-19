import type { UniversalInputAuthorityCommand, UniversalInputAuthorityExecutionResult, UniversalInputRegistration, UniversalInputTargetRuntimeAdapter } from "./contracts";
import { UniversalInputRegistry, universalInputRegistry } from "./registry";

const METHODS = { READ: "read", SET: "set", CLEAR: "clear", FOCUS: "focus", REVEAL: "reveal", VALIDATE: "validate", SELECT: "select", OPEN: "open", CLOSE: "close", COMMIT: "commit", CANCEL: "cancel", CREATE_DRAFT: "createDraft", RECEIVE_ATTACHMENT: "receiveAttachment" } as const satisfies Record<Exclude<UniversalInputAuthorityCommand["type"], "DISCOVER">, keyof UniversalInputTargetRuntimeAdapter>;
export class UniversalInputAuthorityHost {
  constructor(private readonly registry: UniversalInputRegistry = universalInputRegistry) {}
  async execute(command: UniversalInputAuthorityCommand): Promise<UniversalInputAuthorityExecutionResult> {
    if (command.type === "DISCOVER") return { status: "DISCOVERED", discovery: this.registry.discover() };
    const resolved = this.resolve(command); if ("status" in resolved) return resolved; const registration = resolved;
    if ((command.expectedRegistrationToken && command.expectedRegistrationToken !== registration.registrationToken) || (command.expectedGeneration !== undefined && command.expectedGeneration !== registration.generation)) return this.result("STALE_TARGET", registration);
    if ((command.type === "SET" || command.type === "CLEAR") && (!registration.descriptor.mutable || registration.descriptor.readOnly || registration.descriptor.disabled)) return this.result("READ_ONLY", registration);
    const method = METHODS[command.type]; const capability = registration.adapter[method]; if (!capability) return this.result("CAPABILITY_UNAVAILABLE", registration);
    try {
      const value = command.type === "SET" || command.type === "SELECT" ? await (capability as (value: unknown) => unknown)(command.value) : command.type === "RECEIVE_ATTACHMENT" ? command.attachment ? await (capability as (value: NonNullable<typeof command.attachment>) => unknown)(command.attachment) : undefined : await (capability as () => unknown)();
      if (command.type === "VALIDATE" && typeof value === "object" && value !== null && "valid" in value && value.valid === false) return { ...this.result("VALIDATION_FAILED", registration), validation: value as { valid: false; message?: string; missing?: boolean } };
      return { ...this.result(command.type === "CREATE_DRAFT" ? "DRAFT_CREATED" : command.type === "CANCEL" ? "CANCELLED" : "EXECUTED", registration), value };
    } catch (error) { return { ...this.result("EXECUTION_FAILED", registration), error: error instanceof Error ? error.message : "Unknown adapter failure." }; }
  }
  private resolve(command: UniversalInputAuthorityCommand): UniversalInputRegistration | UniversalInputAuthorityExecutionResult { if (command.executiveTargetId) return this.registry.getByTargetId(command.executiveTargetId) ?? { status: "NOT_FOUND" }; if (!command.authorityKey) return { status: "NOT_FOUND" }; const matches = this.registry.getByAuthorityKey(command.authorityKey); return matches.length === 0 ? { status: "NOT_FOUND" } : matches.length > 1 ? { status: "AMBIGUOUS_TARGET" } : matches[0]; }
  private result(status: UniversalInputAuthorityExecutionResult["status"], registration: UniversalInputRegistration): UniversalInputAuthorityExecutionResult { return { status, descriptor: registration.descriptor, registrationToken: registration.registrationToken, generation: registration.generation }; }
}
export const universalInputAuthorityHost = new UniversalInputAuthorityHost();
