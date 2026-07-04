import type { Organization } from "@prisma/client";

export function buildOrganizationSummary(org: Organization): string {
  const parts: string[] = [org.name];

  if (org.industry) {
    parts.push(`${org.industry} sektörü`);
  }

  if (org.companySize) {
    parts.push(`${org.companySize} ölçekli`);
  }

  if (org.city) {
    parts.push(`${org.city}`);
  }

  if (org.description) {
    parts.push(org.description);
  }

  return parts.join(" — ");
}
