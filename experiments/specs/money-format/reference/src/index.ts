/** A money amount as stored: integer minor units with an ISO 4217 currency code. */
export interface Money {
  /** The amount in minor units of `currency`. */
  minorUnits: number;
  /** ISO 4217 currency code, e.g. "USD", "EUR" or "IDR". */
  currency: string;
}

/** Supported currencies and their number of minor-unit digits. */
const MINOR_DIGITS: ReadonlyMap<string, number> = new Map([
  ["USD", 2],
  ["EUR", 2],
  ["IDR", 0],
]);

/** Groups a string of decimal digits in threes with ",". */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+$)/g, ",");
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
  const { minorUnits, currency } = amount;

  const minorDigits = MINOR_DIGITS.get(currency);
  if (minorDigits === undefined) {
    throw new Error(`Unsupported currency: ${currency}`);
  }
  if (!Number.isInteger(minorUnits)) {
    throw new Error(`Amount must be an integer number of minor units, got ${minorUnits}`);
  }

  // BigInt keeps every digit exact; dividing the number in floating point would not.
  const value = BigInt(minorUnits);
  const negative = value < 0n;
  const magnitude = negative ? -value : value;

  const scale = 10n ** BigInt(minorDigits);
  const whole = magnitude / scale;
  const fraction = magnitude % scale;

  let text = groupThousands(whole.toString());
  if (fraction !== 0n) {
    text += "." + fraction.toString().padStart(minorDigits, "0");
  }

  return `${negative ? "-" : ""}${currency} ${text}`;
}
