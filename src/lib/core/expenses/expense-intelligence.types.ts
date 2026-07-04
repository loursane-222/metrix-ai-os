import type { ExpenseCategory } from "@prisma/client";

export type BurnRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ExpenseConfidence = "LOW" | "MEDIUM" | "HIGH";

export type ExpenseCategoryBreakdown = {
  category: ExpenseCategory;
  total: number;
  count: number;
};

export type ExpenseContextItem = {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  expenseDate: Date;
  recurrenceType: string;
  status: string;
  vendorName: string | null;
};

export type ExpenseContext = {
  totalExpenseAmount: number;
  totalPaidAmount: number;
  totalPendingAmount: number;
  totalOverdueAmount: number;
  overdueCount: number;
  pendingCount: number;
  monthlyBurnRate: number;
  categoryBreakdown: ExpenseCategoryBreakdown[];
  hasExpenseData: boolean;
  recentExpenses: ExpenseContextItem[];
};

export type ExpenseIntelligence = {
  burnRiskLevel: BurnRiskLevel;
  monthlyBurnRate: number;
  overdueRatio: number;
  riskWarnings: string[];
  recommendedActions: string[];
  executiveSummary: string;
  hasActiveRisk: boolean;
  confidence: ExpenseConfidence;
};
