export class CustomerUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomerUpdateError";
  }
}

export class CustomerUpdateInputError extends CustomerUpdateError {
  readonly reasons: readonly string[];

  constructor(reasons: readonly string[]) {
    super(`customer.update input is invalid: ${reasons.join("; ")}`);
    this.name = "CustomerUpdateInputError";
    this.reasons = reasons;
  }
}

/**
 * Başka tenant'a ait veya hiç var olmayan bir Customer için aynı, ayrım
 * yapmayan hata — ham tenant bilgisi sızdırılmaz.
 */
export class CustomerNotFoundError extends CustomerUpdateError {
  readonly customerId: string;

  constructor(customerId: string) {
    super(`Customer "${customerId}" was not found.`);
    this.name = "CustomerNotFoundError";
    this.customerId = customerId;
  }
}

export class CustomerVersionConflictError extends CustomerUpdateError {
  readonly customerId: string;

  constructor(customerId: string) {
    super(`Customer "${customerId}" has changed since it was last read; expectedVersion is no longer valid.`);
    this.name = "CustomerVersionConflictError";
    this.customerId = customerId;
  }
}
