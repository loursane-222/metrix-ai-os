import type {
  ExecutiveObjectionType,
  ExecutiveRecommendationAlternative,
  ExecutiveRecommendationPackage,
} from "@/lib/ai/executive-conversation.types";
export type {
  ExecutiveObjectionType,
  ExecutiveRecommendationAlternative,
  ExecutiveRecommendationPackage,
};

export type ExecutiveObjectionSignal = {
  type: ExecutiveObjectionType;
  confidence: number;
  rawKeywords: string[];
};
