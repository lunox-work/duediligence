import { expect, test, vi } from "vitest";

import { byteSize } from "../../src/lib/format";

const KB = 1024;
const MB = 1024 ** 2;
const GB = 1024 ** 3;
const TB = 1024 ** 4;

/** Asserts the RangeError the spec requires for a count that is refused. */
function expectRefused(bytes: number) {
  expect(() => byteSize(bytes)).toThrow(RangeError);
  expect(() => byteSize(bytes)).toThrow("bytes");
}

/**
 * Calls `byteSize` while every default locale the code could read is German,
 * where 1023 is written "1.023": `navigator.language`, `Intl.NumberFormat`
 * and `Number#toLocaleString` without an explicit locale.
 */
function inGermanLocale(bytes: number): string {
  const realToLocaleString = Number.prototype.toLocaleString;
  const RealNumberFormat = Intl.NumberFormat;
  const pick = (locales: unknown) =>
    locales === undefined || (Array.isArray(locales) && locales.length === 0)
      ? "de-DE"
      : (locales as Intl.LocalesArgument);
  const GermanNumberFormat = new Proxy(RealNumberFormat, {
    construct(target, [locales, options]) {
      return new target(pick(locales), options);
    },
    apply(target, _this, [locales, options]) {
      return target(pick(locales), options);
    },
  });
  vi.stubGlobal("navigator", { language: "de-DE", languages: ["de-DE"] });
  vi.stubGlobal(
    "Intl",
    Object.create(Intl, { NumberFormat: { value: GermanNumberFormat } }),
  );
  vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(function (
    this: number,
    locales?: Intl.LocalesArgument,
    options?: Intl.NumberFormatOptions,
  ) {
    return realToLocaleString.call(this, pick(locales), options);
  });
  try {
    return byteSize(bytes);
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
}

// Every example of each scenario, as the spec tabulates it.

test("[happy-1] every example of small counts are bytes", () => {
  expect(byteSize(0)).toBe("0 B");
  expect(byteSize(1)).toBe("1 B");
  expect(byteSize(512)).toBe("512 B");
  expect(byteSize(1023)).toBe("1,023 B");
});

test("[happy-2] every example of each unit starts at its power of 1024", () => {
  expect(byteSize(1024)).toBe("1.0 KB");
  expect(byteSize(1048576)).toBe("1.0 MB");
  expect(byteSize(1073741824)).toBe("1.0 GB");
  expect(byteSize(1099511627776)).toBe("1.0 TB");
  expect(byteSize(5368709120)).toBe("5.0 GB");
});

test("[boundary-1] every example of TB is the largest unit", () => {
  expect(byteSize(1125899906842624)).toBe("1,024 TB");
  expect(byteSize(9007199254740991)).toBe("8,192 TB");
});

test("[happy-3] every example of small values keep a decimal", () => {
  expect(byteSize(1536)).toBe("1.5 KB");
  expect(byteSize(10188)).toBe("9.9 KB");
  expect(byteSize(10189)).toBe("10 KB");
  expect(byteSize(10240)).toBe("10 KB");
  expect(byteSize(1047552)).toBe("1,023 KB");
});

test("[boundary-2] every example of halves round up", () => {
  expect(byteSize(1280)).toBe("1.3 KB");
  expect(byteSize(10752)).toBe("11 KB");
});

test("[boundary-3] every example of rounding up to 1024 carries", () => {
  expect(byteSize(1048063)).toBe("1,023 KB");
  expect(byteSize(1048064)).toBe("1.0 MB");
  expect(byteSize(1073217536)).toBe("1.0 GB");
});

test("[unhappy-1] every example of other numbers are refused", () => {
  expectRefused(-1);
  expectRefused(1.5);
  expectRefused(Number.NaN);
  expectRefused(Number.POSITIVE_INFINITY);
  expectRefused(9007199254740992);
});

// Extends "[happy-1] a small count is shown in bytes": other counts below
// 1024, so a lookup of the visible examples does not pass.
test("[happy-1] other small counts are shown in bytes", () => {
  expect(byteSize(2)).toBe("2 B");
  expect(byteSize(9)).toBe("9 B");
  expect(byteSize(10)).toBe("10 B");
  expect(byteSize(100)).toBe("100 B");
  expect(byteSize(999)).toBe("999 B");
});

// Extends "[happy-1] zero and the largest count below 1024 stay in bytes":
// the comma starts at exactly 1000, not only at 1023.
test("[happy-1] a thousand bytes and more get a comma", () => {
  expect(byteSize(1000)).toBe("1,000 B");
  expect(byteSize(1001)).toBe("1,001 B");
  expect(byteSize(1010)).toBe("1,010 B");
});

// Extends "[happy-1] zero and the largest count below 1024 stay in bytes":
// the comma does not come from the default locale.
test("[happy-1] the bytes comma does not depend on the locale", () => {
  expect(inGermanLocale(1023)).toBe("1,023 B");
  expect(inGermanLocale(512)).toBe("512 B");
});

// Extends "[happy-2] a count is shown in the largest unit it reaches": other
// multiples in each unit.
test("[happy-2] other counts are shown in the largest unit they reach", () => {
  expect(byteSize(2 * KB)).toBe("2.0 KB");
  expect(byteSize(3 * MB)).toBe("3.0 MB");
  expect(byteSize(2.5 * MB)).toBe("2.5 MB");
  expect(byteSize(100 * MB)).toBe("100 MB");
  expect(byteSize(512 * GB)).toBe("512 GB");
  expect(byteSize(7.5 * TB)).toBe("7.5 TB");
  expect(byteSize(10 * TB)).toBe("10 TB");
});

// Extends "[happy-2] each unit starts exactly at its power of 1024": counts
// just past each power stay in that unit.
test("[happy-2] a count just past a power of 1024 is in that unit", () => {
  expect(byteSize(1025)).toBe("1.0 KB");
  expect(byteSize(1075)).toBe("1.0 KB");
  expect(byteSize(1076)).toBe("1.1 KB");
  expect(byteSize(MB + 1)).toBe("1.0 MB");
  expect(byteSize(GB + 1)).toBe("1.0 GB");
  expect(byteSize(TB + 1)).toBe("1.0 TB");
});

// Extends "[boundary-1] 1024 TB stays in TB": larger counts never reach a
// unit past TB.
test("[boundary-1] counts far past 1024 TB stay in TB", () => {
  expect(byteSize(2048 * TB)).toBe("2,048 TB");
  expect(byteSize(4096 * TB)).toBe("4,096 TB");
  expect(byteSize(5000 * TB)).toBe("5,000 TB");
  expect(byteSize(1000 * TB)).toBe("1,000 TB");
});

// Extends "[boundary-1] 1024 TB stays in TB": a TB value that rounds to 1024
// does not carry, since TB is the largest unit.
test("[boundary-1] a TB value that rounds to 1024 stays in TB", () => {
  expect(byteSize(1023.5 * TB)).toBe("1,024 TB");
  expect(byteSize(1024 * TB - 1)).toBe("1,024 TB");
});

// Extends "[boundary-1] the largest safe count is shown in TB": a whole TB
// value is rounded with halves up, as in any unit.
test("[boundary-1] a large TB value is rounded to a whole number", () => {
  expect(byteSize(1500.5 * TB)).toBe("1,501 TB");
  expect(byteSize(1500.25 * TB)).toBe("1,500 TB");
});

// Extends "[happy-3] small values keep one decimal, larger ones are whole":
// `.0` is kept below 10 and dropped from 10, in other units too.
test("[happy-3] a decimal below 10 and a whole number from 10, in any unit", () => {
  expect(byteSize(9 * KB)).toBe("9.0 KB");
  expect(byteSize(9.75 * KB)).toBe("9.8 KB");
  expect(byteSize(99 * KB)).toBe("99 KB");
  expect(byteSize(999 * KB)).toBe("999 KB");
  expect(byteSize(9.25 * MB)).toBe("9.3 MB");
  expect(byteSize(10 * MB)).toBe("10 MB");
  expect(byteSize(10 * GB)).toBe("10 GB");
});

// Extends "[happy-3] small values keep one decimal, larger ones are whole":
// whole numbers of 1000 or more get a comma in every unit.
test("[happy-3] a thousand or more in a unit gets a comma", () => {
  expect(byteSize(1000 * KB)).toBe("1,000 KB");
  expect(byteSize(1000 * MB)).toBe("1,000 MB");
  expect(byteSize(1000 * GB)).toBe("1,000 GB");
  expect(byteSize(1023 * GB)).toBe("1,023 GB");
});

// Extends "[happy-3] small values keep one decimal, larger ones are whole":
// the comma does not come from the default locale.
test("[happy-3] the unit comma does not depend on the locale", () => {
  expect(inGermanLocale(1047552)).toBe("1,023 KB");
  expect(inGermanLocale(1536)).toBe("1.5 KB");
  expect(inGermanLocale(2048 * TB)).toBe("2,048 TB");
});

// Extends "[happy-3] a value that rounds to 10 at one decimal is shown whole":
// the same edge in MB, where the raw value is still below 10.
test("[happy-3] a MB value that rounds to 10 at one decimal is shown whole", () => {
  // 9.9499998 MB and 9.9500008 MB.
  expect(byteSize(10433331)).toBe("9.9 MB");
  expect(byteSize(10433332)).toBe("10 MB");
});

// Extends "[happy-3] small values keep one decimal, larger ones are whole":
// from 10 the whole number is rounded from the value, not from its one-decimal
// rounding.
test("[happy-3] a whole value is rounded from the value itself", () => {
  // 10.4502 KB rounds to 10.5 at one decimal but to 10 as a whole number.
  expect(byteSize(10701)).toBe("10 KB");
  // 100.4502 KB.
  expect(byteSize(102861)).toBe("100 KB");
});

// Extends "[boundary-2] a half at one decimal rounds up": halves that
// half-to-even rounding gets wrong, and halves in other units.
test("[boundary-2] other halves at one decimal round up", () => {
  // 2.25 KB, 1.75 KB.
  expect(byteSize(2304)).toBe("2.3 KB");
  expect(byteSize(1792)).toBe("1.8 KB");
  expect(byteSize(1.25 * MB)).toBe("1.3 MB");
  expect(byteSize(8.75 * GB)).toBe("8.8 GB");
  expect(byteSize(2.25 * TB)).toBe("2.3 TB");
});

// Extends "[boundary-2] a half at a whole number rounds up": halves that
// half-to-even rounding gets wrong, and halves in other units.
test("[boundary-2] other halves at a whole number round up", () => {
  // 12.5 KB, 100.5 KB, 102.5 KB.
  expect(byteSize(12800)).toBe("13 KB");
  expect(byteSize(102912)).toBe("101 KB");
  expect(byteSize(104960)).toBe("103 KB");
  expect(byteSize(10.5 * GB)).toBe("11 GB");
  expect(byteSize(12.5 * MB)).toBe("13 MB");
});

// Extends "[boundary-3] a value that rounds to 1024 moves to the next unit":
// the carry from GB to TB, and from the largest count below each power.
test("[boundary-3] a value that rounds to 1024 carries in every unit below TB", () => {
  // 1023.5 GB.
  expect(byteSize(1023.5 * GB)).toBe("1.0 TB");
  expect(byteSize(MB - 1)).toBe("1.0 MB");
  expect(byteSize(GB - 1)).toBe("1.0 GB");
  expect(byteSize(TB - 1)).toBe("1.0 TB");
});

// Extends "[boundary-3] a value just short of rounding to 1024 stays in its
// unit": the same edge in MB and GB, and values above 1023 that round down.
test("[boundary-3] a value just short of 1024 stays in its unit, in every unit", () => {
  expect(byteSize(1023.5 * MB - 1)).toBe("1,023 MB");
  expect(byteSize(1023.5 * GB - 1)).toBe("1,023 GB");
  // 1023.05 KB and 1023.45 KB.
  expect(byteSize(1047604)).toBe("1,023 KB");
  expect(byteSize(1048013)).toBe("1,023 KB");
});

// Extends "[unhappy-1] a negative or fractional count is refused": other
// negatives and fractions, including fractions large enough to be in a unit.
test("[unhappy-1] other negative and fractional counts are refused", () => {
  expectRefused(-1024);
  expectRefused(-0.5);
  expectRefused(0.1);
  expectRefused(1023.5);
  expectRefused(1024.5);
  expectRefused(1e15 + 0.5);
  expectRefused(Number.MIN_SAFE_INTEGER);
});

// Extends "[unhappy-1] non-finite and unsafe counts are refused": the other
// infinity and unsafe integers well past the limit.
test("[unhappy-1] other non-finite and unsafe counts are refused", () => {
  expectRefused(Number.NEGATIVE_INFINITY);
  expectRefused(Number.MAX_SAFE_INTEGER + 3);
  expectRefused(2 ** 60);
  expectRefused(Number.MAX_VALUE);
});
