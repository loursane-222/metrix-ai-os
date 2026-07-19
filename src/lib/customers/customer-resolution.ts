export type ResolvableCustomer = { id: string; displayName: string; legalName: string | null; phone: string | null; email: string | null; cariKodu: string | null; taxNumber: string | null };
export type CustomerResolution = { status: "RESOLVED"; customer: ResolvableCustomer } | { status: "NOT_FOUND" } | { status: "AMBIGUOUS"; options: ResolvableCustomer[] };
const normalize = (value: string) => value.trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9@+]/g, "");
export function resolveCustomerReference(customers: readonly ResolvableCustomer[], reference: string): CustomerResolution {
  const needle = normalize(reference);
  if (!needle) return { status: "NOT_FOUND" };
  const exact = customers.filter((customer) => [customer.id, customer.displayName, customer.legalName, customer.phone, customer.email, customer.cariKodu, customer.taxNumber].some((value) => value && normalize(value) === needle));
  if (exact.length === 1) return { status: "RESOLVED", customer: exact[0]! };
  if (exact.length > 1) return { status: "AMBIGUOUS", options: exact };
  const partial = customers.filter((customer) => [customer.displayName, customer.legalName, customer.phone, customer.email, customer.cariKodu, customer.taxNumber].some((value) => value && normalize(value).includes(needle)));
  if (partial.length === 1) return { status: "RESOLVED", customer: partial[0]! };
  if (partial.length > 1) return { status: "AMBIGUOUS", options: partial };
  return { status: "NOT_FOUND" };
}
