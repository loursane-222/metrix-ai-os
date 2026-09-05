import { organizationMemberCreateHandler } from "./organization-member-create-handler";
import { organizationMemberUpdateHandler } from "./organization-member-update-handler";
import type { ActionHandlerRegistry } from "../../execution";

/**
 * Composition-root kaydı. Idempotent/duplicate-safe: zaten kayıtlıysa
 * tekrar kaydetmeye çalışmaz (bkz. register-customer-actions.ts).
 */
export function registerTeamActions(handlerRegistry: ActionHandlerRegistry): void {
  if (!handlerRegistry.hasHandler("organization_member.create")) {
    handlerRegistry.registerHandler("organization_member.create", organizationMemberCreateHandler);
  }
  if (!handlerRegistry.hasHandler("organization_member.update")) {
    handlerRegistry.registerHandler("organization_member.update", organizationMemberUpdateHandler);
  }
}
