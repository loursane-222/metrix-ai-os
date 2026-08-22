import { prisma } from "@/lib/core/shared/prisma";
export type CustomerDuplicateCandidate = { customerId: string; displayName: string; strength: "STRONG" | "WEAK"; matchedFields: string[] };
export async function detectCustomerDuplicates(organizationId: string, values: Record<string, unknown>): Promise<CustomerDuplicateCandidate[]> {
  const taxNumber = typeof values["customer.taxNumber"] === "string" ? values["customer.taxNumber"] : undefined;
  const legalName = typeof values["customer.legalName"] === "string" ? values["customer.legalName"] : undefined;
  const cariKodu = typeof values["customer.cariKodu"] === "string" ? values["customer.cariKodu"] : undefined;
  const email = typeof values["customer.email"] === "string" ? values["customer.email"] : undefined;
  const phone = typeof values["customer.phone"] === "string" ? values["customer.phone"] : undefined;
  // Live repro: many real rows (spreadsheet exports from other CRMs) carry
  // only a name — no tax number, cariKodu, email, or phone at all. Without
  // displayName as a match signal, re-importing the same file after a
  // partial commit found zero duplicates for any such row and would have
  // silently created a second customer for every one of them.
  const displayName = typeof values["customer.displayName"] === "string" ? values["customer.displayName"] : undefined;
  const clauses = [{ taxNumber }, { legalName }, { cariKodu }, { email }, { phone }, { displayName }].filter((entry) => Object.values(entry)[0]); if (!clauses.length) return [];
  const rows = await prisma.customer.findMany({ where: { organizationId, OR: clauses }, select: { id: true, displayName: true, taxNumber: true, legalName: true, cariKodu: true, email: true, phone: true }, take: 10 });
  return rows.map((row) => { const matchedFields = (["taxNumber", "legalName", "cariKodu", "email", "phone", "displayName"] as const).filter((key) => values[`customer.${key}`] !== undefined && row[key] === values[`customer.${key}`]); const strong = matchedFields.includes("taxNumber") || matchedFields.includes("cariKodu") || matchedFields.includes("displayName") || (matchedFields.includes("legalName") && matchedFields.length > 1); return { customerId: row.id, displayName: row.displayName, strength: strong ? "STRONG" : "WEAK", matchedFields }; });
}
