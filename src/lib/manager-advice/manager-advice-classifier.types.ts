export type ManagerAdviceCategory =
  | "SALES"
  | "CUSTOMER_CONFLICT"
  | "PRICING"
  | "COLLECTION"
  | "OPERATIONS"
  | "TEAM"
  | "HIRING"
  | "CASHFLOW"
  | "STRATEGY"
  | "PERSONAL"
  | "GENERAL";

export type ManagerAdviceConfidence = "LOW" | "MEDIUM" | "HIGH";

export type ClassifyManagerAdviceInput = {
  message: string;
};

export type ManagerAdviceClassification = {
  category: ManagerAdviceCategory;
  confidence: ManagerAdviceConfidence;
};
