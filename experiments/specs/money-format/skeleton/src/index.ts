/** A money amount as stored: integer minor units with an ISO 4217 currency code. */
export interface Money {
  /** The amount in minor units of `currency`. */
  minorUnits: number;
  /** ISO 4217 currency code, e.g. "USD", "EUR" or "IDR". */
  currency: string;
}

/**
 * Formats a money amount for display: the currency code, one space, then the
 * amount, with whole units grouped in threes by "," and "." before any
 * fraction.
 *
 * @throws Error if the currency is not supported; the message names the currency.
 * @throws Error if the amount is not a whole number of minor units; the message
 *   says the amount must be an integer.
 */
export function formatMoney(amount: Money): string {
  throw new Error("not implemented");
}
