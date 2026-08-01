export class QuoteUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteUpdateError";
  }
}

export class QuoteUpdateInputError extends QuoteUpdateError {
  readonly reasons: readonly string[];

  constructor(reasons: readonly string[]) {
    super(`quote.update input is invalid: ${reasons.join("; ")}`);
    this.name = "QuoteUpdateInputError";
    this.reasons = reasons;
  }
}

export class QuoteNotFoundError extends QuoteUpdateError {
  readonly quoteId: string;

  constructor(quoteId: string) {
    super(`Quote "${quoteId}" was not found.`);
    this.name = "QuoteNotFoundError";
    this.quoteId = quoteId;
  }
}

export class QuoteVersionConflictError extends QuoteUpdateError {
  readonly quoteId: string;

  constructor(quoteId: string) {
    super(`Quote "${quoteId}" has changed since it was last read; expectedVersion is no longer valid.`);
    this.name = "QuoteVersionConflictError";
    this.quoteId = quoteId;
  }
}
