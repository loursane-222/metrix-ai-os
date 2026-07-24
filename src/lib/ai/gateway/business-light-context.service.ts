import { prisma } from "@/lib/core/shared/prisma";

const MAX_CANDIDATES = 50;
const MAX_MATCHES = 3;

function normalize(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ");
}

export async function buildBusinessLightContext(input: {
  organizationId: string;
  message: string;
}): Promise<string | null> {
  const normalizedMessage = normalize(input.message);
  const customers = await prisma.customer.findMany({
    where: { organizationId: input.organizationId },
    orderBy: { updatedAt: "desc" },
    take: MAX_CANDIDATES,
    select: {
      displayName: true,
      legalName: true,
      status: true,
      balanceCents: true,
      currency: true,
      tier: true,
      healthScore: true,
      metrixNote: true,
    },
  });

  const matches = customers
    .filter((customer) => {
      const names = [customer.displayName, customer.legalName]
        .filter((value): value is string => Boolean(value?.trim()))
        .map(normalize);
      return names.some(
        (name) => name.length >= 3 && normalizedMessage.includes(name),
      );
    })
    .slice(0, MAX_MATCHES);

  if (matches.length === 0) return null;

  return [
    "Relevant customer records:",
    ...matches.map((customer) =>
      [
        customer.displayName,
        `status=${customer.status}`,
        `balance=${customer.balanceCents.toString()} ${customer.currency}`,
        customer.tier ? `tier=${customer.tier}` : null,
        customer.healthScore !== null
          ? `healthScore=${customer.healthScore}`
          : null,
        customer.metrixNote ? `note=${customer.metrixNote.slice(0, 240)}` : null,
      ].filter(Boolean).join(" | ")),
  ].join("\n");
}
