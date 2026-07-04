export type {
  ExecutiveAdapterInput,
  ExecutiveAdapterModuleResult,
  ExecutiveAdapterResult,
} from "./executive-adapter.types";

export { runExecutiveAdapter } from "./executive-adapter.service";

export {
  runConversationUnderstandingAdapter,
  runExecutiveContextBuilderAdapter,
  runCompanyModelAdapter,
  runExecutiveReasoningAdapter,
  runRecommendedNextMoveAdapter,
  runLearningLoopAdapter,
  runExecutiveBrainShadowAdapter,
  runForecastAdapter,
  runDecisionLoopAdapter,
} from "./modules";
