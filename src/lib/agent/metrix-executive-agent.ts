import {
  Agent,
  run
} from "@openai/agents";

import {
  createTaskCreateTool
} from "./tools/task-create-tool";

import {
  createCustomerLookupTool
} from "./tools/customer-lookup-tool";

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

export function createMetrixExecutiveAgent(
  temporalContext?: {
    timezone: string;
    referenceTimeIso: string;
  }
) {
  const temporalInstructions =
    temporalContext
      ? `

Trusted server time context:
- Reference time: ${temporalContext.referenceTimeIso}
- User timezone: ${temporalContext.timezone}

Görev talebinde kullanıcı "bugün", "yarın", "cuma", "gelecek hafta"
gibi göreli bir zaman söylüyorsa yalnız bu trusted reference time ve
timezone'a göre yorumla.

Kullanıcı tarih veya saat belirttiyse task_create aracının dueAt alanına
karşılık gelen kesin ISO 8601 zamanı ver.

Kullanıcı tarih/zaman belirtmediyse dueAt uydurma.
`
      : "";

  return new Agent<MetrixExecutiveContext>({
    name: "METRIX",

    model: "gpt-5.6-sol",

    instructions:
      `${METRIX_EXECUTIVE_INSTRUCTIONS}${temporalInstructions}`,

    tools: [
      createTaskCreateTool(),
      createCustomerLookupTool()
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

  const timezone =
    input.timezone?.trim() ||
    "Europe/Istanbul";

  const referenceTimeIso =
    input.referenceTimeIso?.trim() ||
    new Date().toISOString();

  if (
    Number.isNaN(
      Date.parse(
        referenceTimeIso
      )
    )
  ) {
    throw new Error(
      "Invalid trusted reference time"
    );
  }

  const agent =
    createMetrixExecutiveAgent({
      timezone,
      referenceTimeIso
    });

  const result = await run(
    agent,
    message,
    {
      context: {
        actorUserId,
        organizationId,
        turnId,
        timezone,
        referenceTimeIso
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
