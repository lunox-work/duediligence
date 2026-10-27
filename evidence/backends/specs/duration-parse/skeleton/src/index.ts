/**
 * Turns a duration string into whole milliseconds, trimming surrounding whitespace.
 * Throws an Error whose message contains "duration" for invalid durations or totals above Number.MAX_SAFE_INTEGER.
 */
export function parseDuration(text: string): number {
  throw new Error("not implemented");
}

/**
 * Turns milliseconds into the shortest duration string, largest units first, omitting zero components; zero is "0ms".
 * Throws an Error whose message contains "milliseconds" unless ms is a non-negative safe integer.
 */
export function formatDuration(ms: number): string {
  throw new Error("not implemented");
}
