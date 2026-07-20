export type ConversationSubmitSource = "written" | "voice";
export type ConversationSubmitPhase = "RESOLVING_EXTENSION" | "RUNNING_AI" | "COMPLETED" | "CANCELLED";

export type ConversationSubmitTurn = Readonly<{
  turnId: string;
  generation: number;
  text: string;
  source: ConversationSubmitSource;
  startedAt: number;
  phase: ConversationSubmitPhase;
}>;

export class ConversationSubmitController {
  private generation = 0;
  private active: ConversationSubmitTurn | null = null;

  constructor(private readonly clock = Date.now, private readonly createId = () => crypto.randomUUID()) {}

  claim(text: string, source: ConversationSubmitSource): ConversationSubmitTurn | null {
    const normalized = text.trim();
    if (!normalized || this.active) return null;
    const turn = Object.freeze({ turnId: this.createId(), generation: ++this.generation, text: normalized, source, startedAt: this.clock(), phase: "RESOLVING_EXTENSION" as const });
    this.active = turn;
    return turn;
  }

  transition(turn: ConversationSubmitTurn, phase: Exclude<ConversationSubmitPhase, "CANCELLED">): boolean {
    if (!this.isCurrent(turn)) return false;
    this.active = Object.freeze({ ...turn, phase });
    if (phase === "COMPLETED") this.active = null;
    return true;
  }

  cancel(): ConversationSubmitTurn | null {
    const cancelled = this.active ? Object.freeze({ ...this.active, phase: "CANCELLED" as const }) : null;
    this.active = null;
    this.generation += 1;
    return cancelled;
  }

  isCurrent(turn: ConversationSubmitTurn): boolean { return this.active?.generation === turn.generation && this.active.turnId === turn.turnId; }
  getActive(): ConversationSubmitTurn | null { return this.active; }
}
