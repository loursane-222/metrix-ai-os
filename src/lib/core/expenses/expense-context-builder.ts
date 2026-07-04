import { listExpensesForOrganization } from "./expense-repository";
import type { ExpenseCategory } from "@prisma/client";
import type {
  ExpenseCategoryBreakdown,
  ExpenseContext,
  ExpenseContextItem,
} from "./expense-intelligence.types";

const BURN_RATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_RECENT_EXPENSES = 20;
const LIST_LIMIT = 300;

export async function buildExpenseContextForOrganization(
  organizationId: string,
): Promise<ExpenseContext> {
  const expenses = await listExpensesForOrganization({
    organizationId,
    limit: LIST_LIMIT,
  });

  const now = new Date();
  const burnRateCutoff = new Date(now.getTime() - BURN_RATE_WINDOW_MS);

  const active = expenses.filter((e) => e.status !== "CANCELLED");

  let totalExpenseAmount = 0;
  let totalPaidAmount = 0;
  let totalPendingAmount = 0;
  let totalOverdueAmount = 0;
  let overdueCount = 0;
  let pendingCount = 0;
  let monthlyBurnRate = 0;

  const categoryMap = new Map<ExpenseCategory, { total: number; count: number }>();

  for (const e of active) {
    const amount = Number(e.amount);
    totalExpenseAmount += amount;

    if (e.status === "PAID") {
      totalPaidAmount += amount;
    } else if (e.status === "PENDING") {
      totalPendingAmount += amount;
      pendingCount++;
    } else if (e.status === "OVERDUE") {
      totalOverdueAmount += amount;
      overdueCount++;
    }

    const existing = categoryMap.get(e.category) ?? { total: 0, count: 0 };
    categoryMap.set(e.category, { total: existing.total + amount, count: existing.count + 1 });

    if (e.recurrenceType !== "ONCE" && e.expenseDate >= burnRateCutoff) {
      if (e.recurrenceType === "MONTHLY") monthlyBurnRate += amount;
      else if (e.recurrenceType === "QUARTERLY") monthlyBurnRate += amount / 3;
      else if (e.recurrenceType === "ANNUAL") monthlyBurnRate += amount / 12;
    }
  }

  const categoryBreakdown: ExpenseCategoryBreakdown[] = [...categoryMap.entries()]
    .map(([category, { total, count }]) => ({ category, total, count }))
    .sort((a, b) => b.total - a.total);

  const recentExpenses: ExpenseContextItem[] = active
    .slice(0, MAX_RECENT_EXPENSES)
    .map((e) => ({
      id: e.id,
      title: e.title,
      category: e.category,
      amount: Number(e.amount),
      currency: e.currency,
      expenseDate: e.expenseDate,
      recurrenceType: e.recurrenceType,
      status: e.status,
      vendorName: e.vendorName ?? null,
    }));

  return {
    totalExpenseAmount,
    totalPaidAmount,
    totalPendingAmount,
    totalOverdueAmount,
    overdueCount,
    pendingCount,
    monthlyBurnRate,
    categoryBreakdown,
    hasExpenseData: active.length > 0,
    recentExpenses,
  };
}
