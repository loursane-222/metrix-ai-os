import { db } from "../db";

import { requireOrganizationAccess } from "../auth/organization-access";

export type SalesByCurrency = {
  currency: string;
  invoiceCount: number;
  totalAmount: number;
  totalTaxAmount: number;
  totalWithTax: number;
};

export type SalesSummaryReality = {
  periodStart: string;
  periodEnd: string;
  byCurrency: SalesByCurrency[];
};

export class InvalidSalesPeriodError extends Error {
  readonly code = "INVALID_SALES_PERIOD";

  constructor() {
    super("periodStart must be before periodEnd");
    this.name = "InvalidSalesPeriodError";
  }
}

/**
 * "Satış" burada faturalanan gerçeği ifade eder: dönem içinde
 * organizasyonda oluşturulan Invoice'ların (Task 16 kernel'inin tek
 * satış gerçeği) toplamı, para birimine göre gruplu. Quote/Order henüz
 * faturalanmamış potansiyeldir — bu tool onları saymaz.
 */
export async function lookupSalesSummary(
  input: {
    actorUserId: string;
    organizationId: string;
    periodStart: string;
    periodEnd: string;
  }
): Promise<SalesSummaryReality> {
  const actorUserId = input.actorUserId.trim();
  const organizationId = input.organizationId.trim();

  await requireOrganizationAccess({
    userId: actorUserId,
    organizationId
  });

  const start = new Date(input.periodStart);
  const end = new Date(input.periodEnd);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start.getTime() > end.getTime()
  ) {
    throw new InvalidSalesPeriodError();
  }

  const invoices = await db.invoice.findMany({
    where: {
      organizationId,
      createdAt: { gte: start, lte: end }
    },
    select: {
      currency: true,
      amount: true,
      taxAmount: true,
      totalAmount: true
    }
  });

  const byCurrencyMap = new Map<string, SalesByCurrency>();

  for (const invoice of invoices) {
    const bucket = byCurrencyMap.get(invoice.currency) ?? {
      currency: invoice.currency,
      invoiceCount: 0,
      totalAmount: 0,
      totalTaxAmount: 0,
      totalWithTax: 0
    };

    bucket.invoiceCount += 1;
    bucket.totalAmount += Number(invoice.amount);
    bucket.totalTaxAmount += Number(invoice.taxAmount);
    bucket.totalWithTax += Number(invoice.totalAmount);

    byCurrencyMap.set(invoice.currency, bucket);
  }

  return {
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    byCurrency: Array.from(byCurrencyMap.values())
  };
}
