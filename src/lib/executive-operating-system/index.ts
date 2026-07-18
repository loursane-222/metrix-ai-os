export { buildExecutiveOperatingSystem } from "./executive-operating-system.service";
export { buildCompanyModel } from "./company-model-builder.service";

export { EXECUTIVE_PHILOSOPHY } from "./executive-philosophy";
export type { ExecutivePhilosophy } from "./executive-philosophy";

export { EMPTY_EXECUTIVE_WORLD_MODEL, EXECUTIVE_WORLD_MODEL } from "./executive-world-model.types";
export type {
  BusinessCyclePrinciple,
  FinancialHealthPrinciple,
  SalesCyclePrinciple,
  PeoplePrinciple,
  OperationalPrinciple,
  ExecutiveWorldModel,
} from "./executive-world-model.types";

export { EMPTY_COMPANY_MODEL, EXECUTIVE_COMPANY_MODEL } from "./company-model.types";
export type {
  CompanyModelConfidence,
  CompanyModelFact,
  CompanyGrowthPhase,
  CompanyModel,
  ExecutiveCompanyModelDimension,
  ExecutiveCompanyModel,
} from "./company-model.types";

export { EXECUTIVE_REASONING_SYSTEM_PROMPT } from "./executive-reasoning.prompt";
export { RECOMMENDED_NEXT_MOVE_SYSTEM_PROMPT } from "./recommended-next-move.prompt";
export { LEARNING_LOOP_SYSTEM_PROMPT } from "./learning-loop.prompt";

export { REASONING_PLACEHOLDER } from "./executive-reasoning.types";
export type {
  EvidenceWeight,
  RiskSeverity,
  Reversibility,
  ImpactMagnitude,
  OrganizationalScope,
  TimingUrgency,
  ReasoningEvidence,
  ReasoningRisk,
  ReasoningPriority,
  ReasoningOpportunity,
  TimingAssessment,
  OrganizationalImpact,
  TradeOffOption,
  TradeOffAssessment,
  ExecutiveReasoning,
} from "./executive-reasoning.types";

export { NEXT_MOVE_PLACEHOLDER } from "./recommended-next-move.types";
export type {
  NextMoveConfidence,
  NextMoveAlternative,
  NextMoveTimeframe,
  RecommendedNextMove,
} from "./recommended-next-move.types";

export { parseRecommendedNextMove } from "./recommended-next-move.parser";

export { parseLearningLoop } from "./learning-loop.parser";
export {
  authorizeEosLearning,
  persistAuthorizedEosLearning,
} from "./eos-learning-authority.service";

export { LEARNING_LOOP_NOOP } from "./learning-loop.types";
export type {
  LearningSignalStrength,
  LearningTrigger,
  LearningCandidate,
  ExecutiveLearningLoop,
} from "./learning-loop.types";

export type {
  ExecutiveOperatingSystemInput,
  ExecutiveOperatingSystem,
} from "./executive-operating-system.types";
