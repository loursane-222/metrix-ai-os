export type BusinessNavigationRouteType = "METRIX_ROOT" | "COMPANY_ROOT" | "CUSTOMER_LIST" | "CUSTOMER_CREATE" | "CUSTOMER_DETAIL" | "CUSTOMER_EDIT" | "OFFERS_LIST" | "PRODUCTS_LIST" | "OTHER";
type SafeValue = string | number | boolean | null | undefined;

export function businessNavigationRouteType(route: string): BusinessNavigationRouteType {
  const path = route.split(/[?#]/, 1)[0]?.replace(/\/$/, "") || "/";
  if (path === "/metrix") return "METRIX_ROOT";
  if (path === "/metrix/company") return "COMPANY_ROOT";
  if (path === "/metrix/customers") return "CUSTOMER_LIST";
  if (path === "/metrix/customers/new") return "CUSTOMER_CREATE";
  if (/^\/metrix\/customers\/[^/]+\/edit$/u.test(path)) return "CUSTOMER_EDIT";
  if (/^\/metrix\/customers\/[^/]+$/u.test(path)) return "CUSTOMER_DETAIL";
  if (path === "/metrix/offers") return "OFFERS_LIST";
  if (path === "/metrix/products") return "PRODUCTS_LIST";
  return "OTHER";
}

export function emitBusinessNavigationTelemetry(scope: "BusinessNavigation" | "BusinessNavigationClient", payload: Readonly<Record<string, SafeValue>>): void {
  console.info(`[${scope}][lifecycle]`, JSON.stringify(payload));
}
