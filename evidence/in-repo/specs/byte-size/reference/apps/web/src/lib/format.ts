import { formatMinorUnits } from "sandbox-factory";
export function fractionDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en", {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

export function editableRateAmount(minor: number, digits: number): string {
  // Drop only an all-zero fraction from stored amounts. Legacy fractional
  // rates stay visible and must be corrected before the form can be saved.
  return (formatMinorUnits(minor, digits) ?? "").replace(/\.0+$/, "");
}

const MODEL_VENDORS: Record<string, string> = {
  claude: "Claude",
  deepseek: "DeepSeek",
};

/**
 * A readable name for a provider model id, e.g. `claude-sonnet-5` →
 * "Claude Sonnet 5", `deepseek-v4-pro` → "DeepSeek V4 Pro". Adjacent numeric
 * segments are a version (`4-6` → "4.6"); an eight-digit segment is a
 * snapshot date and is dropped. Unknown vendors are capitalised as-is, so a
 * new provider still reads as a name rather than an id. `null` when the
 * proposal carries no model.
 */
export function modelLabel(id: string | null | undefined): string | null {
  if (id === undefined || id === null || id.trim() === "") return null;
  const words: string[] = [];
  for (const segment of id.trim().split("-")) {
    if (segment === "") continue;
    if (/^\d{8}$/.test(segment)) continue;
    if (/^\d+$/.test(segment) && /^\d+(\.\d+)*$/.test(words.at(-1) ?? "")) {
      words[words.length - 1] = `${words.at(-1)}.${segment}`;
      continue;
    }
    words.push(
      MODEL_VENDORS[segment.toLowerCase()] ??
        segment[0]!.toUpperCase() + segment.slice(1),
    );
  }
  return words.length === 0 ? null : words.join(" ");
}

export function money(
  amountMinor: number | null,
  currency: string | null,
): string {
  if (amountMinor === null || currency === null) return "Unpriced";
  const digits = fractionDigits(currency);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amountMinor / 10 ** digits);
}

export function plural(count: number, one: string): string {
  return `${count.toLocaleString("en-US")} ${one}${count === 1 ? "" : "s"}`;
}

/** A moment as a person reads it, in their own time zone: "Oct 5, 2026, 1:40 PM". */
export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * An amount in whole units of its currency, for a range rather than a
 * price: "$58", not "$58.00". Rounded, so it never claims a precision the
 * range does not have.
 */
export function wholeMoney(amountMinor: number, currency: string): string {
  const digits = fractionDigits(currency);
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amountMinor / 10 ** digits));
}

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/**
 * A byte count as the short text a person reads: "512 B", "1.5 KB",
 * "12 MB". 1024-based units B, KB, MB, GB and TB, independent of the
 * browser's locale. Throws a RangeError whose message contains "bytes" when
 * the count is not a whole, non-negative, safe integer.
 */
export function byteSize(bytes: number): string {
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new RangeError(`Not a count of bytes: ${bytes}`);
  }
  if (bytes < 1024) return `${bytes.toLocaleString("en-US")} B`;
  let unit = 1;
  while (unit < BYTE_UNITS.length - 1 && bytes >= 1024 ** (unit + 1)) unit++;
  for (;;) {
    // Split into whole units and a remainder so the rounding stays exact:
    // `bytes * 10` can pass MAX_SAFE_INTEGER, the remainder times 10 cannot.
    const size = 1024 ** unit;
    const whole = Math.floor(bytes / size);
    const rest = bytes - whole * size;
    const tenths = whole * 10 + Math.floor((rest * 10 + size / 2) / size);
    if (tenths < 100) {
      return `${Math.floor(tenths / 10)}.${tenths % 10} ${BYTE_UNITS[unit]}`;
    }
    const rounded = whole + (rest * 2 >= size ? 1 : 0);
    if (rounded < 1024 || unit === BYTE_UNITS.length - 1) {
      return `${rounded.toLocaleString("en-US")} ${BYTE_UNITS[unit]}`;
    }
    unit++;
  }
}
