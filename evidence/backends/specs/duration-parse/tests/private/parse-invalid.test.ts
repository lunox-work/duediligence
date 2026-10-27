import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDuration } from "../../src/index.js";

function invalid(text: string): void {
  assert.throws(
    () => parseDuration(text),
    (error: unknown) => error instanceof Error && error.message.includes("duration"),
    JSON.stringify(text),
  );
}

// Extends public "[unhappy-1] rejects the empty string".
test("[unhappy-1] trimming cannot supply a missing component", () => {
  for (const text of ["", "\f", "\v", " \n\t".repeat(300)]) invalid(text);
});

// Extends public "[unhappy-1] rejects a bare number".
test("[unhappy-1] rejects bare zero and digits after a complete component", () => {
  for (const text of ["0", "123456789012345", "1h30", "4ms7", "2d0"]) invalid(text);
});

// Extends public "[unhappy-1] rejects fractional counts".
test("[unhappy-1] rejects decimals even when their numeric value is integral", () => {
  for (const text of ["2.0s", ".5m", "5.ms", "0.0d", "2h3.5m", "1s0.001ms"]) invalid(text);
});

// Extends public "[unhappy-1] rejects a leading zero".
test("[unhappy-1] validates leading digits of every component", () => {
  for (const text of ["01d", "02h", "03m", "04ms", "1d02h", "7h8m009s", "5s0001ms"]) invalid(text);
});

// Extends public "[unhappy-1] rejects a negative sign".
test("[unhappy-1] rejects negative zero and negative interior components", () => {
  for (const text of ["-0ms", "-27d", "2h-1m", "9s-0ms"]) invalid(text);
});

// Extends public "[unhappy-1] rejects a positive sign".
test("[unhappy-1] rejects explicit plus on zero and later components", () => {
  for (const text of ["+0d", "+15ms", "3d+2h", "1m+8s"]) invalid(text);
});

// Extends public "[unhappy-1] rejects spaces between components".
test("[unhappy-1] rejects every ordinary internal whitespace character", () => {
  for (const separator of [" ", "\t", "\r", "\n", "\v", "\f", " \t\r\n "]) {
    invalid(` 2d3h${separator}4m5s6ms `);
  }
});

// Extends public "[unhappy-1] rejects comma separators".
test("[unhappy-1] rejects punctuation separators and digit grouping", () => {
  for (const text of ["2h:15m", "4m/5s", "1d;2h", "1h_2m", "1h,2m,3s", "1,000ms", "1_000ms"]) invalid(text);
});

// Extends public "[unhappy-1] rejects weeks".
test("[unhappy-1] rejects other units even after a valid prefix", () => {
  for (const text of ["2y", "8w", "4us", "3ns", "2h1w", "1h2min", "4sec", "7days"]) invalid(text);
});

// Extends public "[unhappy-1] rejects uppercase seconds".
test("[unhappy-1] rejects every uppercase single letter unit", () => {
  for (const text of ["8D", "7H", "6M", "5S", "1d2H", "3h4M"]) invalid(text);
});

// Extends public "[unhappy-1] rejects whitespace between count and unit".
test("[unhappy-1] requires adjacent digits and the entire unit token", () => {
  for (const text of ["7\th", "3\ns", "5m s", "6\rms", "2d3 \fm", "8m\ts"]) invalid(text);
});

// Extends public "[unhappy-1] rejects a unit without a count".
test("[unhappy-1] requires a count for every unit including later components", () => {
  for (const text of ["d", "h", "m", "s", "1dh", "7hms", "2mss", "3sms", "1msms"]) invalid(text);
});

// Extends public "[unhappy-1] rejects input that becomes empty after trimming".
test("[unhappy-1] rejects whitespace only inputs of different lengths", () => {
  for (const text of [" ", "\t", "\n\r", "\v\f", " ".repeat(4096)]) invalid(text);
});

// Extends public "[unhappy-1] rejects multiple zero digits".
test("[unhappy-1] rejects multiple zero digits in each unit and interior position", () => {
  for (const unit of ["d", "h", "m", "s", "ms"]) invalid(`00${unit}`);
  invalid("2d00h3m");
  invalid("4m000s5ms");
  invalid(`${"0".repeat(4096)}ms`);
});

// Extends public "[unhappy-1] rejects uppercase milliseconds".
test("[unhappy-1] rejects uppercase millisecond units after valid components", () => {
  for (const text of ["17MS", "1d2MS", "3m4s5MS"]) invalid(text);
});

// Extends public "[unhappy-1] rejects mixed case milliseconds".
test("[unhappy-1] rejects both mixed case spellings in interior and final units", () => {
  for (const text of ["8mS", "9Ms", "1h2mS", "4s5Ms", "1mS2s"]) invalid(text);
});

// Extends public "[unhappy-1] rejects an internal newline".
test("[unhappy-1] trimming outer line breaks does not erase internal ones", () => {
  for (const text of ["\n2d\n3h\n", "1m\r\n2s", "4\nms", "2h3\rm"]) invalid(text);
});

// Extends public "[unhappy-1] rejects trailing non-duration text".
test("[unhappy-1] consumes the entire input including its prefix and suffix", () => {
  for (const text of ["junk12ms", "!3h", "1sXYZ", "2ms3", "4h?5m", "1h\u00002ms", "1s\u0000", "1h30m!"]) invalid(text);
});

// Extends public "[unhappy-1] rejects exponent notation".
test("[unhappy-1] accepts only decimal integer spellings of counts", () => {
  for (const text of ["2e2s", "1E3ms", "1e+2h", "1e-2m", "0x10ms", "0b11s", "0o10m", "NaNms", "Infinitys"]) invalid(text);
});

test("[unhappy-1] rejects malformed later components after a long valid count", () => {
  const prefix = "9007199254739s";
  for (const suffix of ["1.0ms", "+1ms", "01ms", "1MS", "ms", "1ms!"]) invalid(prefix + suffix);
});

// Extends public "[unhappy-2] rejects minutes followed by hours".
test("[unhappy-2] rejects every pair of ascending distinct units", () => {
  const units = ["d", "h", "m", "s", "ms"];
  for (let smaller = 1; smaller < units.length; smaller++) {
    for (let larger = 0; larger < smaller; larger++) {
      invalid(`7${units[smaller]}2${units[larger]}`);
    }
  }
});

// Extends public "[unhappy-2] rejects repeated hours".
test("[unhappy-2] rejects adjacent duplicates of every unit", () => {
  for (const unit of ["d", "h", "m", "s", "ms"]) invalid(`2${unit}3${unit}`);
});

// Extends public "[unhappy-2] rejects seconds repeated after milliseconds".
test("[unhappy-2] rejects a return to any earlier unit after intervening units", () => {
  for (const text of ["2d3h4m5d", "2h3m4s5h", "2m3s4ms5m", "7s8ms9s"]) invalid(text);
});

// Extends public "[unhappy-2] rejects milliseconds followed by seconds".
test("[unhappy-2] milliseconds cannot be followed by any larger unit", () => {
  for (const unit of ["d", "h", "m", "s"]) {
    invalid(`8ms3${unit}`);
    invalid(`8ms0${unit}`);
  }
});

// Extends public "[unhappy-2] rejects out-of-order zero components".
test("[unhappy-2] zero counts do not exempt any pair from unit ordering", () => {
  const units = ["d", "h", "m", "s", "ms"];
  for (let smaller = 1; smaller < units.length; smaller++) {
    for (let larger = 0; larger < smaller; larger++) {
      invalid(`0${units[smaller]}0${units[larger]}`);
      invalid(`0${units[smaller]}1${units[larger]}`);
      invalid(`1${units[smaller]}0${units[larger]}`);
    }
  }
});

// Extends public "[unhappy-2] rejects repeated zero components".
test("[unhappy-2] duplicates remain invalid when either or both counts are zero", () => {
  for (const unit of ["d", "h", "m", "s", "ms"]) {
    invalid(`0${unit}0${unit}`);
    invalid(`0${unit}4${unit}`);
    invalid(`4${unit}0${unit}`);
  }
});

// Extends public "[unhappy-2] rejects repeated days separated by another unit".
test("[unhappy-2] detects repeats late in an otherwise descending five unit string", () => {
  for (const unit of ["d", "h", "m", "s", "ms"]) {
    invalid(`2d3h4m5s6ms7${unit}`);
  }
  invalid("2d0h0m0s0ms0d");
});
