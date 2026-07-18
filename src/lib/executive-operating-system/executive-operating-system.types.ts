import type { ExecutiveContextV2 } from "@/lib/executive-context-builder";
import type { ExecutivePhilosophy } from "./executive-philosophy";
import type { ExecutiveWorldModel } from "./executive-world-model.types";
import type { CompanyModel } from "./company-model.types";
import type { ExecutiveReasoning } from "./executive-reasoning.types";
import type { RecommendedNextMove } from "./recommended-next-move.types";
import type { ExecutiveLearningLoop } from "./learning-loop.types";

export type ExecutiveOperatingSystemInput = {
  executiveContext: ExecutiveContextV2;
  companyModel: CompanyModel;
  generatedAt: string;
  learningPersistenceContext?: {
    organizationId: string;
    createdByUserId?: string | null;
  };
};

export type ExecutiveOperatingSystem = {
  philosophy: ExecutivePhilosophy;
  worldModel: ExecutiveWorldModel;
  companyModel: CompanyModel;
  executiveContext: ExecutiveContextV2;
  reasoning: ExecutiveReasoning;
  recommendedNextMove: RecommendedNextMove;
  learningLoop: ExecutiveLearningLoop;
  generatedAt: string;
};
