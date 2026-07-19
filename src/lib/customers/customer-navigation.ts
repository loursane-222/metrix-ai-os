export type CustomerNavigationDescriptor =
  | { kind: "customers.list" }
  | { kind: "customer.create" }
  | { kind: "customer.detail"; customerId: string }
  | { kind: "customer.edit"; customerId: string };

const SAFE_ID = /^[a-zA-Z0-9_-]+$/;
export function buildCustomerRoute(descriptor: CustomerNavigationDescriptor): string {
  if (descriptor.kind === "customers.list") return "/metrix/customers";
  if (descriptor.kind === "customer.create") return "/metrix/customers/new";
  if (!SAFE_ID.test(descriptor.customerId)) throw new Error("Invalid customer navigation target.");
  const id = encodeURIComponent(descriptor.customerId);
  return descriptor.kind === "customer.detail" ? `/metrix/customers/${id}` : `/metrix/customers/${id}/edit`;
}
