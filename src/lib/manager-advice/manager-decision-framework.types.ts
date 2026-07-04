import type { ManagerAdviceCategory } from "./manager-advice-classifier.types";

export type ManagerDecisionStep = {
  order: number;
  question: string;
  reason: string;
};

export type ManagerDecisionFramework = {
  frameworkId: string;
  category: ManagerAdviceCategory;
  title: string;
  description: string;
  steps: ManagerDecisionStep[];
};
