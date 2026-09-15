// Shared domain errors for the inventory/operations kernel (purchase,
// transfer, transformation, lookup). Centralized so every action and the
// generic not-found tenant boundary use exactly the same error identity —
// mirrors how the commercial kernel already shares error classes across
// action files (e.g. QuoteNotFoundError re-exported from quote-update.ts).

export class LocationNotFoundError extends Error {
  readonly code = "LOCATION_NOT_FOUND";

  constructor() {
    super("Location was not found in the authorized organization");
    this.name = "LocationNotFoundError";
  }
}

export class SupplierNotFoundError extends Error {
  readonly code = "SUPPLIER_NOT_FOUND";

  constructor() {
    super("Supplier was not found in the authorized organization");
    this.name = "SupplierNotFoundError";
  }
}

export class ProductServiceNotFoundError extends Error {
  readonly code = "PRODUCT_SERVICE_NOT_FOUND";

  constructor() {
    super("Product/service was not found in the authorized organization");
    this.name = "ProductServiceNotFoundError";
  }
}

/**
 * Fail-closed negative-inventory policy: an OUT movement (transfer,
 * transformation consumption) may never be allowed to drive a balance
 * below zero. This is never silent — the entire business transaction is
 * rejected and rolled back before any movement is persisted.
 */
export class InsufficientInventoryError extends Error {
  readonly code = "INSUFFICIENT_INVENTORY";

  constructor() {
    super(
      "Requested quantity exceeds available inventory at this location"
    );
    this.name = "InsufficientInventoryError";
  }
}
