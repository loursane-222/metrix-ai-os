import { EXECUTIVE_PHILOSOPHY } from "./executive-philosophy";
import { EXECUTIVE_WORLD_MODEL } from "./executive-world-model.types";
import { generateExecutiveReasoningRaw } from "./executive-reasoning.gateway";
import { parseExecutiveReasoning } from "./executive-reasoning.parser";
import { generateRecommendedNextMoveRaw } from "./recommended-next-move.gateway";
import { parseRecommendedNextMove } from "./recommended-next-move.parser";
import { generateLearningLoopRaw } from "./learning-loop.gateway";
import { parseLearningLoop } from "./learning-loop.parser";
import { LEARNING_LOOP_NOOP } from "./learning-loop.types";
import type {
  ExecutiveOperatingSystem,
  ExecutiveOperatingSystemInput,
} from "./executive-operating-system.types";
import type { ExecutiveContextV2 } from "@/lib/executive-context-builder";
import type { ExecutivePhilosophy } from "./executive-philosophy";
import type { ExecutiveWorldModel } from "./executive-world-model.types";
import type { CompanyModel } from "./company-model.types";
import type { ExecutiveReasoning } from "./executive-reasoning.types";
import type { RecommendedNextMove } from "./recommended-next-move.types";

async function buildExecutiveReasoning(
  executiveContext: ExecutiveContextV2,
  companyModel: CompanyModel,
  philosophy: ExecutivePhilosophy,
  worldModel: ExecutiveWorldModel,
): Promise<ExecutiveReasoning> {
  const tTotal = performance.now();
  const raw = await generateExecutiveReasoningRaw(executiveContext, companyModel, philosophy, worldModel);
  const tParse = performance.now();
  const result = parseExecutiveReasoning(raw);
  console.info(
    `[PERF:reasoning] reasoning_parse=${Math.round(performance.now() - tParse)}ms` +
    ` reasoning_total=${Math.round(performance.now() - tTotal)}ms`,
  );
  return result;
}

async function buildRecommendedNextMove(
  reasoning: ExecutiveReasoning,
): Promise<RecommendedNextMove> {
  const raw = await generateRecommendedNextMoveRaw(reasoning);
  return parseRecommendedNextMove(raw);
}

async function runLearningLoopBackground(
  reasoning: ExecutiveReasoning,
  recommendedNextMove: RecommendedNextMove,
): Promise<void> {
  const t0 = performance.now();
  try {
    const raw = await generateLearningLoopRaw(reasoning, recommendedNextMove);
    parseLearningLoop(raw);
    const ms = Math.round(performance.now() - t0);
    console.info(`[PERF:eos] eos_learning_loop_background=${ms}ms`);
  } catch (err) {
    console.warn("[EOS] eos_learning_loop_background failed:", err);
  }
}

export async function buildExecutiveOperatingSystem(
  input: ExecutiveOperatingSystemInput,
): Promise<ExecutiveOperatingSystem> {
  const philosophy = EXECUTIVE_PHILOSOPHY;
  const worldModel = EXECUTIVE_WORLD_MODEL;
  const { companyModel, executiveContext, generatedAt } = input;
  const t3 = performance.now();
  const reasoning = await buildExecutiveReasoning(executiveContext, companyModel, philosophy, worldModel).finally(() => {
    console.info(`[PERF:ei] ei_build_reasoning=${Math.round(performance.now() - t3)}ms`);
  });
  const t4 = performance.now();
  const recommendedNextMove = await buildRecommendedNextMove(reasoning).finally(() => {
    console.info(`[PERF:ei] ei_recommended_next_move=${Math.round(performance.now() - t4)}ms`);
  });

  // Call #5 — critical path dışı: response beklenmeden arka planda çalışır.
  void runLearningLoopBackground(reasoning, recommendedNextMove);

  return {
    philosophy,
    worldModel,
    companyModel,
    executiveContext,
    reasoning,
    recommendedNextMove,
    learningLoop: LEARNING_LOOP_NOOP,
    generatedAt,
  };
}
