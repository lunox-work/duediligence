// Units from largest to smallest, with their size in milliseconds.
const UNITS: ReadonlyArray<readonly [string, bigint]> = [
  ["d", 86400000n],
  ["h", 3600000n],
  ["m", 60000n],
  ["s", 1000n],
  ["ms", 1n],
];

// One component: a count without sign or leading zeros, then a unit. `ms` is
// tried before `m` so that `1ms` is not read as `1m` followed by `s`.
const COMPONENT = /^(0|[1-9][0-9]*)(ms|d|h|m|s)/;

const MAX = BigInt(Number.MAX_SAFE_INTEGER);

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
  if (typeof text !== "string") {
    throw new Error("invalid duration: expected a string");
  }
  let rest = text.trim();
  if (rest === "") {
    throw new Error("invalid duration: empty string");
  }

  let total = 0n;
  // Index into UNITS of the next unit allowed; enforces descending order and
  // at most one occurrence of each unit.
  let next = 0;
  while (rest !== "") {
    const match = COMPONENT.exec(rest);
    if (match === null) {
      throw new Error(`invalid duration: ${JSON.stringify(text)}`);
    }
    const [component, count, unit] = match;
    const index = UNITS.findIndex(([name]) => name === unit);
    if (index < next) {
      throw new Error(
        `invalid duration: unit "${unit}" out of order or repeated in ${JSON.stringify(text)}`,
      );
    }
    next = index + 1;
    total += BigInt(count) * UNITS[index][1];
    if (total > MAX) {
      throw new Error(`invalid duration: ${JSON.stringify(text)} exceeds Number.MAX_SAFE_INTEGER milliseconds`);
    }
    rest = rest.slice(component.length);
  }
  return Number(total);
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
  if (!Number.isSafeInteger(ms) || ms < 0) {
    throw new Error(`invalid milliseconds: ${String(ms)} is not a non-negative safe integer`);
  }
  if (ms === 0) {
    return "0ms";
  }
  let rest = BigInt(ms);
  let text = "";
  for (const [unit, size] of UNITS) {
    const count = rest / size;
    rest %= size;
    if (count > 0n) {
      text += `${count}${unit}`;
    }
  }
  return text;
}
