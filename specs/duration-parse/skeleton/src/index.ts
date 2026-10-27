/**
 * Turns a duration string such as `1h30m` or `250ms` into whole milliseconds.
 * A duration is one or more components, each a count and a unit (`d`, `h`,
 * `m`, `s`, `ms`), with units running from largest to smallest, each at most
 * once. Leading and trailing whitespace is removed before parsing.
 *
 * @throws {Error} with a message containing "duration" if the text is not a
 *   valid duration, or if its total exceeds Number.MAX_SAFE_INTEGER.
 */
export function parseDuration(text: string): number {
  throw new Error("not implemented");
}

/**
 * Turns a non-negative safe integer number of milliseconds back into the
 * shortest duration string that parses back to it: largest units first,
 * every zero component left out. Zero is "0ms".
 *
 * @throws {Error} with a message containing "milliseconds" if `ms` is not a
 *   non-negative safe integer.
 */
export function formatDuration(ms: number): string {
  throw new Error("not implemented");
}
