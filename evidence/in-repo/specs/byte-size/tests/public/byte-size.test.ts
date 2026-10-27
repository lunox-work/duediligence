import { expect, test } from "vitest";

import { byteSize } from "../src/lib/format";

/** Asserts the RangeError the spec requires for a count that is refused. */
function expectRefused(bytes: number) {
  expect(() => byteSize(bytes)).toThrow(RangeError);
  expect(() => byteSize(bytes)).toThrow("bytes");
}

test("[happy-1] a small count is shown in bytes", () => {
  expect(byteSize(1)).toBe("1 B");
  expect(byteSize(512)).toBe("512 B");
});

test("[happy-1] zero and the largest count below 1024 stay in bytes", () => {
  expect(byteSize(0)).toBe("0 B");
  // A thousand or more gets a comma, in bytes as in any unit.
  expect(byteSize(1023)).toBe("1,023 B");
});

test("[happy-2] a count is shown in the largest unit it reaches", () => {
  expect(byteSize(5368709120)).toBe("5.0 GB");
});

test("[happy-2] each unit starts exactly at its power of 1024", () => {
  expect(byteSize(1024)).toBe("1.0 KB");
  expect(byteSize(1048576)).toBe("1.0 MB");
  expect(byteSize(1073741824)).toBe("1.0 GB");
  expect(byteSize(1099511627776)).toBe("1.0 TB");
});

test("[boundary-1] 1024 TB stays in TB", () => {
  expect(byteSize(1125899906842624)).toBe("1,024 TB");
});

test("[boundary-1] the largest safe count is shown in TB", () => {
  expect(byteSize(Number.MAX_SAFE_INTEGER)).toBe("8,192 TB");
});

test("[happy-3] small values keep one decimal, larger ones are whole", () => {
  expect(byteSize(1536)).toBe("1.5 KB");
  expect(byteSize(10240)).toBe("10 KB");
  expect(byteSize(1047552)).toBe("1,023 KB");
});

test("[happy-3] a value that rounds to 10 at one decimal is shown whole", () => {
  expect(byteSize(10188)).toBe("9.9 KB");
  expect(byteSize(10189)).toBe("10 KB");
});

test("[boundary-2] a half at one decimal rounds up", () => {
  // 1.25 KB.
  expect(byteSize(1280)).toBe("1.3 KB");
});

test("[boundary-2] a half at a whole number rounds up", () => {
  // 10.5 KB.
  expect(byteSize(10752)).toBe("11 KB");
});

test("[boundary-3] a value that rounds to 1024 moves to the next unit", () => {
  // 1023.5 KB and 1023.5 MB.
  expect(byteSize(1048064)).toBe("1.0 MB");
  expect(byteSize(1073217536)).toBe("1.0 GB");
});

test("[boundary-3] a value just short of rounding to 1024 stays in its unit", () => {
  expect(byteSize(1048063)).toBe("1,023 KB");
});

test("[unhappy-1] a negative or fractional count is refused", () => {
  expectRefused(-1);
  expectRefused(1.5);
});

test("[unhappy-1] non-finite and unsafe counts are refused", () => {
  expectRefused(Number.NaN);
  expectRefused(Number.POSITIVE_INFINITY);
  expectRefused(Number.MAX_SAFE_INTEGER + 1);
});
