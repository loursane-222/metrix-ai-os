import type { ReactElement } from "react";
import { CustomerCreateScreen } from "@/components/customers/CustomerCreateScreen";
import { CustomerEditScreen } from "@/components/customers/CustomerEditScreen";
import type { WorkspaceDirective } from "@/lib/living-workspace";

/** Resolves only real business components; generic rendering remains the host fallback. */
export function resolveBusinessSurface(directive: WorkspaceDirective): ReactElement | null {
  if (directive.businessSurface === "customer-create") {
    return <CustomerCreateScreen presentation="living"/>;
  }
  if ((directive.businessSurface === "customer-edit" || directive.businessSurface === "customer-detail") && directive.entityId) {
    return <CustomerEditScreen customerId={directive.entityId} presentation="living"/>;
  }
  return null;
}

export function resolveBusinessSurfaceAuthorityKey(directive: WorkspaceDirective): string | null {
  if (directive.businessSurface === "customer-list") return "customers.list.page";
  if (directive.businessSurface === "customer-detail") return "customers.detail.page";
  return null;
}
