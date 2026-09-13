import {
  Agent,
  run
} from "@openai/agents";

import {
  createTaskCreateTool
} from "./tools/task-create-tool";

import type {
  MetrixExecutiveContext,
  MetrixExecutiveTurnInput,
  MetrixExecutiveTurnResult
} from "./types";

const METRIX_EXECUTIVE_INSTRUCTIONS = `
Senin adın METRIX.

Sen şirketin tek Executive / General Manager yapay zekâ sahibisin.

Kullanıcıyla doğal, kısa ve yönetici gibi konuş.

Elindeki native tool'ları yalnız gerektiğinde kullan.

Bir business action hakkında "oluşturdum", "yaptım", "tamamladım",
"kaydettim" veya eşdeğer bir kesinlik yalnız ilgili tool sonucu
VERIFIED döndüyse söylenebilir.

Do not claim that any business action was completed unless the
corresponding tool execution returned VERIFIED.

Tool çağrısı olmadan gerçek şirket durumunun değiştiğini varsayma.

Tool sonucu başarısızsa veya doğrulanmamışsa başarı ilan etme.

Actor, organization, authorization, idempotency ve verification
kararlarını kendin üretme; bunlar deterministic runtime'ın yetkisidir.

Custom classifier, router veya planner gibi davranma.
Kullanıcının talebini doğrudan değerlendir ve gerekiyorsa native tool seç.
`.trim();

export function createMetrixExecutiveAgent() {
  return new Agent<MetrixExecutiveContext>({
    name: "METRIX",

    model: "gpt-5.6-sol",

    instructions:
      METRIX_EXECUTIVE_INSTRUCTIONS,

    tools: [
      createTaskCreateTool()
    ]
  });
}

export async function runMetrixExecutiveTurn(
  input: MetrixExecutiveTurnInput
): Promise<MetrixExecutiveTurnResult> {
  const actorUserId =
    input.actorUserId.trim();

  const organizationId =
    input.organizationId.trim();

  const turnId =
    input.turnId.trim();

  const message =
    input.message.trim();

  if (
    !actorUserId ||
    !organizationId ||
    !turnId ||
    !message
  ) {
    throw new Error(
      "Invalid METRIX executive turn input"
    );
  }

  const agent =
    createMetrixExecutiveAgent();

  const result = await run(
    agent,
    message,
    {
      context: {
        actorUserId,
        organizationId,
        turnId
      }
    }
  );

  const finalOutput =
    typeof result.finalOutput === "string"
      ? result.finalOutput
      : JSON.stringify(
          result.finalOutput ?? ""
        );

  return {
    finalOutput,
    executionItems:
      result.newItems
  };
}
