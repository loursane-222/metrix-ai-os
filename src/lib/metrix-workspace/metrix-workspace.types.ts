export type MetrixCustomer = {
  id: string;
  name: string;
  industry: string;
  status: string;
  collectionStatus: string;
  lastContactDate: string;
  riskLevel: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  id: string;
  name: string;
  category: string;
  price: string;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type OfferLineItem = {
  id: string;
  name: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
};

export type ActivityLogEntry = {
  at: string;
  type: "view" | "question" | "approved" | "created" | "updated";
  note: string;
};

export type Offer = {
  id: string;
  customerName: string;
  title: string;
  amount: string;
  status: string;
  expectedCloseDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  // Extended fields (optional for backward compat with old localStorage data)
  offerNo?: string;
  validityDate?: string;
  totalArea?: string;
  estimatedDuration?: string;
  description?: string;
  lineItems?: OfferLineItem[];
  paymentTerms?: string;
  deliveryTerms?: string;
  conditions?: string;
  viewCount?: number;
  lastViewedAt?: string;
  heatScore?: number;
  activityLog?: ActivityLogEntry[];
  approvedAt?: string;
  customerQuestion?: string;
};

export type Collection = {
  id: string;
  customerName: string;
  amount: string;
  dueDate: string;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type TeamMember = {
  id: string;
  name: string;
  role: string;
  phone: string;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Supplier = {
  id: string;
  name: string;
  category: string;
  contact: string;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type BusinessDocument = {
  id: string;
  title: string;
  category: string;
  relatedParty: string;
  date: string;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Goal = {
  id: string;
  title: string;
  owner: string;
  targetDate: string;
  progress: string;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkPlanItem = {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  workloadPercent: string;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type CompanyProfile = {
  companyName: string;
  industry: string;
  workingStyle: string;
  mainGoal: string;
  notes: string;
  updatedAt: string;
};

export type AccountingProfile = {
  accountantName: string;
  contact: string;
  integrationStatus: string;
  notes: string;
  updatedAt: string;
};

export type SalesOpportunity = {
  id: string;
  customer: string;
  name: string;
  amount: string;
  stage: string;
  expectedCloseDate: string;
  notes: string;
  updatedAt: string;
};

export type FinanceItem = {
  id: string;
  customer: string;
  amount: string;
  dueDate: string;
  paymentStatus: string;
  description: string;
  updatedAt: string;
};

export type ExecutiveTask = {
  id: string;
  title: string;
  owner: string;
  priority: string;
  date: string;
  status: string;
  notes: string;
  updatedAt: string;
};

export type ReportTemplate = {
  id: string;
  industry: string;
  title: string;
  sections: string;
  updatedAt: string;
};

export type GeneratedReport = {
  id: string;
  title: string;
  summary: string;
  source: string;
  createdAt: string;
};

export type MetrixWorkspaceData = {
  companyProfile: CompanyProfile;
  accountingProfile: AccountingProfile;
  customers: MetrixCustomer[];
  products: Product[];
  offers: Offer[];
  collections: Collection[];
  team: TeamMember[];
  suppliers: Supplier[];
  documents: BusinessDocument[];
  goals: Goal[];
  workPlan: WorkPlanItem[];
  sales: SalesOpportunity[];
  finance: FinanceItem[];
  tasks: ExecutiveTask[];
  templates: ReportTemplate[];
  reports: GeneratedReport[];
};
