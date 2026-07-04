export type ExecutiveRole =
  | "general-manager"
  | "cfo"
  | "sales"
  | "coo"
  | "chro"
  | "cco"
  | "cmo"
  | "executive-assistant";

export type ExecutivePrinciple = {
  id: string;
  statement: string;
};

export type ExecutiveQuestion = {
  id: string;
  question: string;
};

export type ExecutivePriority = {
  id: string;
  label: string;
  description: string;
};

export type ExecutiveConstitution = {
  role: ExecutiveRole;
  title: string;
  mission: string;
  operatingMode: string;
  principles: ExecutivePrinciple[];
  defaultQuestions: ExecutiveQuestion[];
  priorities: ExecutivePriority[];
  boundaries: string[];
};

export type ExecutiveCouncilConstitution = {
  id: "executive-council";
  title: string;
  mission: string;
  principles: ExecutivePrinciple[];
  memberRoles: ExecutiveRole[];
  activationRule: string;
  boundaries: string[];
};

export type ExecutiveActivationTopic =
  | "collection"
  | "hiring"
  | "new_customer"
  | "operations_problem"
  | "cashflow"
  | "pricing"
  | "team"
  | "marketing"
  | "customer_conflict"
  | "general";

export type ExecutiveCouncilActivation = {
  topic: ExecutiveActivationTopic;
  roles: ExecutiveRole[];
  reason: string;
};

export type ExecutiveConstitutionContext = {
  version: "v1";
  generatedAt: string;
  constitutions: ExecutiveConstitution[];
  council: ExecutiveCouncilConstitution;
};
