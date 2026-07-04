import { MemoryItemType } from "@prisma/client";

import type { MemoryItemResult } from "@/lib/core/memory-items/memory-item.types";
import type {
  EvaluateMemoryUpdateInput,
  MemoryUpdateDecision,
} from "./memory-update-engine.types";

type MemoryUpdateRule = {
  id: string;
  key: string;
  type: MemoryItemType;
  evaluate: (input: {
    memoryItem: MemoryItemResult;
    message: string;
  }) => MemoryUpdateDecision | null;
};

const MEMORY_UPDATE_RULES: MemoryUpdateRule[] = [
  {
    id: "team_size_delta_or_explicit_v1",
    key: "team_size",
    type: MemoryItemType.FACT,
    evaluate: evaluateTeamSizeUpdate,
  },
  {
    id: "strategic_focus_keyword_v1",
    key: "strategic_focus",
    type: MemoryItemType.STRATEGIC,
    evaluate: evaluateStrategicFocusUpdate,
  },
];

export function evaluateMemoryUpdateDecisions(
  input: EvaluateMemoryUpdateInput,
): MemoryUpdateDecision[] {
  const decisions: MemoryUpdateDecision[] = [];

  for (const memoryItem of input.activeMemoryItems) {
    const rule = findUpdateRule(memoryItem);

    if (!rule) {
      continue;
    }

    const decision = rule.evaluate({
      memoryItem,
      message: input.message,
    });

    if (!decision || decision.kind === "NO_CHANGE") {
      continue;
    }

    decisions.push(decision);
  }

  return decisions;
}

function findUpdateRule(memoryItem: MemoryItemResult): MemoryUpdateRule | null {
  return (
    MEMORY_UPDATE_RULES.find(
      (rule) =>
        rule.type === memoryItem.type &&
        normalizeValue(rule.key) === normalizeValue(memoryItem.key),
    ) ?? null
  );
}

function evaluateTeamSizeUpdate(input: {
  memoryItem: MemoryItemResult;
  message: string;
}): MemoryUpdateDecision | null {
  const normalizedMessage = normalizeValue(input.message);
  const currentTeamSize = extractFirstNumber(input.memoryItem.value);

  if (currentTeamSize === null || !mentionsTeam(normalizedMessage)) {
    return null;
  }

  const increment = detectTeamSizeIncrement(normalizedMessage);
  const proposedTeamSize =
    increment === null
      ? detectExplicitTeamSize(normalizedMessage)
      : currentTeamSize + increment;

  if (proposedTeamSize === null || proposedTeamSize === currentTeamSize) {
    return {
      kind: "SUPPORTS_EXISTING",
      ruleId: "team_size_delta_or_explicit_v1",
      proposedType: input.memoryItem.type,
      proposedKey: input.memoryItem.key,
      proposedValue: input.memoryItem.value,
      confidence: 0.8,
      requiresApproval: false,
      reason: "Kullanıcı mevcut ekip büyüklüğü bilgisini destekleyen bir ifade verdi.",
      evidence: {
        currentValue: input.memoryItem.value,
        sourceMessage: input.message,
      },
      memoryItem: input.memoryItem,
      previousValue: input.memoryItem.value,
    };
  }

  const proposedValue = `${proposedTeamSize} kişi`;

  return {
    kind: "UPDATE_EXISTING",
    ruleId: "team_size_delta_or_explicit_v1",
    proposedType: input.memoryItem.type,
    proposedKey: input.memoryItem.key,
    proposedValue,
    confidence: 0.9,
    requiresApproval: true,
    reason: `Ekip büyüklüğünü ${input.memoryItem.value} yerine ${proposedValue} olarak güncellememi ister misin?`,
    evidence: {
      currentValue: input.memoryItem.value,
      sourceMessage: input.message,
      detectedIncrement: increment,
      parsedCurrentNumber: currentTeamSize,
      parsedProposedNumber: proposedTeamSize,
    },
    memoryItem: input.memoryItem,
    previousValue: input.memoryItem.value,
    supersedesMemoryId: input.memoryItem.id,
  };
}

function mentionsTeam(message: string): boolean {
  return /\b(ekip|ekibe|ekibi|ekibimiz|kişiyiz|kisiyiz|kişi olduk|kisi olduk)\b/u.test(
    message,
  );
}

function detectTeamSizeIncrement(message: string): number | null {
  const match = message.match(
    /\b(\d+)\s*(?:kişi|kisi)?\s*daha\s*(?:aldım|aldik|aldık|işe aldım|işe aldik|işe aldık)?\b/u,
  );

  if (!match) {
    return null;
  }

  return parsePositiveInteger(match[1]);
}

function detectExplicitTeamSize(message: string): number | null {
  const patterns = [
    /\bartık\s*(\d+)\s*(?:kişi|kisi)yiz\b/u,
    /\b(\d+)\s*(?:kişi|kisi)\s*olduk\b/u,
    /\bekip\s*(?:artık\s*)?(\d+)\s*(?:kişi|kisi)\s*oldu\b/u,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (match) {
      return parsePositiveInteger(match[1]);
    }
  }

  return null;
}

function evaluateStrategicFocusUpdate(input: {
  memoryItem: MemoryItemResult;
  message: string;
}): MemoryUpdateDecision | null {
  const proposedFocus = detectStrategicFocus(input.message);

  if (!proposedFocus) {
    return null;
  }

  if (normalizeValue(proposedFocus) === normalizeValue(input.memoryItem.value)) {
    return {
      kind: "SUPPORTS_EXISTING",
      ruleId: "strategic_focus_keyword_v1",
      proposedType: input.memoryItem.type,
      proposedKey: input.memoryItem.key,
      proposedValue: input.memoryItem.value,
      confidence: 0.75,
      requiresApproval: false,
      reason: "Kullanıcı mevcut stratejik odağı destekleyen bir ifade verdi.",
      evidence: {
        currentValue: input.memoryItem.value,
        sourceMessage: input.message,
      },
      memoryItem: input.memoryItem,
      previousValue: input.memoryItem.value,
    };
  }

  return {
    kind: "UPDATE_EXISTING",
    ruleId: "strategic_focus_keyword_v1",
    proposedType: input.memoryItem.type,
    proposedKey: input.memoryItem.key,
    proposedValue: proposedFocus,
    confidence: 0.82,
    requiresApproval: true,
    reason: `Stratejik odağını ${input.memoryItem.value} yerine ${proposedFocus} olarak güncellememi ister misin?`,
    evidence: {
      currentValue: input.memoryItem.value,
      sourceMessage: input.message,
      detectedFocus: proposedFocus,
    },
    memoryItem: input.memoryItem,
    previousValue: input.memoryItem.value,
    supersedesMemoryId: input.memoryItem.id,
  };
}

function detectStrategicFocus(message: string): string | null {
  const normalizedMessage = normalizeValue(message);

  if (!mentionsStrategicFocusIntent(normalizedMessage)) {
    return null;
  }

  if (includesAny(normalizedMessage, ["tahsilat", "alacak"])) {
    return "tahsilat";
  }

  if (
    includesAny(normalizedMessage, [
      "yeni müşteri",
      "yeni musteri",
      "müşteri kazanımı",
      "musteri kazanimi",
      "müşteri kazanmak",
      "musteri kazanmak",
    ])
  ) {
    return "yeni müşteri kazanımı";
  }

  if (includesAny(normalizedMessage, ["karlılık", "karlilik", "kar etmek"])) {
    return "karlılığı artırmak";
  }

  if (includesAny(normalizedMessage, ["büyümek", "buyumek", "büyüme", "buyume"])) {
    return "büyümek";
  }

  return null;
}

function mentionsStrategicFocusIntent(message: string): boolean {
  return includesAny(message, [
    "önceliğim",
    "onceligim",
    "odaklanıyorum",
    "odaklaniyorum",
    "en önemli konum",
    "en onemli konum",
    "en kritik hedef",
    "kritik hedef",
    "hedefim",
  ]);
}

function extractFirstNumber(value: string): number | null {
  const match = value.match(/\d+/u);

  if (!match) {
    return null;
  }

  return parsePositiveInteger(match[0]);
}

function parsePositiveInteger(value: string): number | null {
  const numberValue = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(numberValue) || numberValue <= 0) {
    return null;
  }

  return numberValue;
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function normalizeValue(value: string): string {
  return value.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
}
