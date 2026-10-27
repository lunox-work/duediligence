const units = [
  ["d", 86400000n],
  ["h", 3600000n],
  ["m", 60000n],
  ["s", 1000n],
  ["ms", 1n],
] as const;

const maxMilliseconds = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Turns a duration string into whole milliseconds, trimming surrounding whitespace.
 * Throws an Error whose message contains "duration" for invalid durations or totals above Number.MAX_SAFE_INTEGER.
 */
export function parseDuration(text: string): number {
  if (typeof text !== "string") throw new Error("Invalid duration");
  const input = text.trim();
  if (input.length === 0) throw new Error("Invalid duration");

  // Sticky matching requires every component to start where the last ended.
  // Match milliseconds before minutes because they share a prefix.
  const component = /(0|[1-9][0-9]*)(ms|d|h|m|s)/y;
  let position = 0;
  let previousUnit = -1;
  let total = 0n;

  while (position < input.length) {
    component.lastIndex = position;
    const match = component.exec(input);
    if (match === null) throw new Error("Invalid duration");

    const unitIndex = units.findIndex(([unit]) => unit === match[2]);
    if (unitIndex <= previousUnit) throw new Error("Invalid duration unit order");

    // Keep arithmetic exact until the total has been checked against the limit.
    total += BigInt(match[1]) * units[unitIndex][1];
    if (total > maxMilliseconds) throw new Error("Unsafe duration total");

    previousUnit = unitIndex;
    position = component.lastIndex;
  }

  return Number(total);
}

/**
 * Turns milliseconds into the shortest duration string, largest units first, omitting zero components; zero is "0ms".
 * Throws an Error whose message contains "milliseconds" unless ms is a non-negative safe integer.
 */
export function formatDuration(ms: number): string {
  if (!Number.isSafeInteger(ms) || ms < 0) {
    throw new Error("Invalid milliseconds");
  }
  if (ms === 0) return "0ms";

  let remaining = BigInt(ms);
  let result = "";
  for (const [unit, weight] of units) {
    const count = remaining / weight;
    if (count !== 0n) result += `${count}${unit}`;
    remaining %= weight;
  }
  return result;
}
