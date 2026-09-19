// Pure interpretation of a /api/metrix text-turn response, kept beside the
// thin visual component (same split as conversation-client.ts) so the
// failure vocabulary is testable without React or fetch. It never invents an
// Executive answer: a turn that did not finish only ever yields a runtime
// status, and the client stays content-blind about what was committed.

import type { Presentation } from "../presentation/contracts";

export const TURN_INCOMPLETE_CODE = "TURN_INCOMPLETE";

export const TURN_INCOMPLETE_NOTICE =
  "İşlem kaydedildi ancak yanıt tamamlanamadı. Tekrar göndermenize gerek yok.";

export const TURN_FAILED_NOTICE =
  "METRIX şu anda yanıt veremedi. Tekrar deneyin.";

export type InterpretedMetrixTurn =
  | {
      kind: "completed";
      executiveText: string;
      presentation: Presentation | null;
      conversationId: string | undefined;
    }
  | {
      // The server committed work but the turn did not finish. No answer text.
      kind: "incomplete_committed";
      presentation: Presentation | null;
    }
  | { kind: "failed" };

function presentationOf(turnResult: unknown): Presentation | null {
  if (typeof turnResult !== "object" || turnResult === null) return null;

  const presentations = (turnResult as { presentations?: unknown }).presentations;

  return Array.isArray(presentations) && presentations.length > 0
    ? (presentations[0] as Presentation)
    : null;
}

/**
 * `httpOk` (the HTTP status) and `payload` (the parsed JSON body, or null
 * when the body was not JSON) are judged separately: a non-JSON 5xx is a
 * plain failure, not a lost connection, and only an explicit
 * `TURN_INCOMPLETE` + `committed: true` body is treated as committed.
 */
export function interpretMetrixTurnResponse(input: {
  httpOk: boolean;
  payload: unknown;
}): InterpretedMetrixTurn {
  const { payload } = input;

  if (typeof payload !== "object" || payload === null) return { kind: "failed" };

  const body = payload as {
    ok?: unknown;
    code?: unknown;
    committed?: unknown;
    conversationId?: unknown;
    turnResult?: unknown;
  };

  if (
    body.ok === false &&
    body.code === TURN_INCOMPLETE_CODE &&
    body.committed === true
  ) {
    return { kind: "incomplete_committed", presentation: presentationOf(body.turnResult) };
  }

  if (!input.httpOk || body.ok !== true) return { kind: "failed" };

  const turnResult = body.turnResult as { executiveText?: unknown } | undefined;

  return {
    kind: "completed",
    executiveText:
      typeof turnResult?.executiveText === "string" ? turnResult.executiveText : "",
    presentation: presentationOf(body.turnResult),
    conversationId:
      typeof body.conversationId === "string" && body.conversationId
        ? body.conversationId
        : undefined
  };
}
