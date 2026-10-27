/**
 * Readable display of a value for the NonExhaustiveError message: what JSON
 * can show is shown as JSON.stringify shows it, what JSON cannot show is
 * shown rather than dropped, a value inside itself is shown as [Circular],
 * and a display longer than 200 characters is cut and followed by "…".
 * Never throws.
 */
export function displayValue(value: unknown): string {
  throw new Error("not implemented");
}

/**
 * Error when the given input value does not match any included pattern
 * and .exhaustive() was specified
 */
export class NonExhaustiveError extends Error {
  constructor(public input: unknown) {
    let displayedValue;
    try {
      displayedValue = JSON.stringify(input);
    } catch (e) {
      displayedValue = input;
    }
    super(`Pattern matching error: no pattern matches value ${displayedValue}`);
  }
}
