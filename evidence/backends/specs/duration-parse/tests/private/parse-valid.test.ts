import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDuration } from "../../src/index.js";

// Extends public "[happy-1] parses milliseconds".
test("[happy-1] parses varied millisecond counts without truncating", () => {
  for (const ms of [2, 17, 807, 12345, 2147483648, 4294967297]) {
    assert.equal(parseDuration(`${ms}ms`), ms);
  }
});

// Extends public "[happy-1] parses seconds".
test("[happy-1] scales seconds beyond small and signed 32 bit counts", () => {
  for (const seconds of [7, 123, 54321, 2147483649]) {
    assert.equal(parseDuration(`${seconds}s`), seconds * 1000);
  }
});

// Extends public "[happy-1] adds hours and minutes".
test("[happy-1] adds different hour and minute counts", () => {
  assert.equal(parseDuration("12h47m"), 46020000);
  assert.equal(parseDuration("7h3m"), 25380000);
});

// Extends public "[happy-1] parses days".
test("[happy-1] scales multiple digits of days", () => {
  for (const days of [3, 17, 365, 100000]) {
    assert.equal(parseDuration(`${days}d`), days * 86400000);
  }
});

// Extends public "[happy-1] allows a single zero count".
test("[happy-1] accepts zero alone in every unit", () => {
  for (const unit of ["d", "h", "m", "s", "ms"]) {
    assert.equal(parseDuration(`0${unit}`), 0);
  }
});

// Extends public "[happy-1] accepts zero components after days".
test("[happy-1] retains positive lower units after intervening zeros", () => {
  assert.equal(parseDuration("0d0h7m0s9ms"), 420009);
  assert.equal(parseDuration("3d0h0m0s8ms"), 259200008);
  assert.equal(parseDuration("0d6h0m5s0ms"), 21605000);
});

// Extends public "[happy-1] parses the smallest positive duration".
test("[happy-1] retains one millisecond after much larger components", () => {
  assert.equal(parseDuration("12345d1ms"), 12345 * 86400000 + 1);
  assert.equal(parseDuration("0d0h0m0s1ms"), 1);
});

// Extends public "[happy-1] adds all five units".
test("[happy-1] adds five distinct multi digit component counts", () => {
  assert.equal(parseDuration("12d13h14m15s678ms"), 1084455678);
  assert.equal(parseDuration("7d23h59m58s987ms"), 691198987);
});

// Extends public "[happy-1] distinguishes minutes from milliseconds".
test("[happy-1] distinguishes the shared m prefix at several counts", () => {
  assert.equal(parseDuration("12m345ms"), 720345);
  assert.equal(parseDuration("23m0s67ms"), 1380067);
  assert.equal(parseDuration("0m76ms"), 76);
});

// Extends public "[happy-1] allows all components to be zero".
test("[happy-1] accepts every nonempty subset of zero components", () => {
  const units = ["d", "h", "m", "s", "ms"];
  for (let mask = 1; mask < 32; mask++) {
    const text = units.filter((_, i) => (mask & (1 << i)) !== 0)
      .map((unit) => `0${unit}`).join("");
    assert.equal(parseDuration(text), 0, text);
  }
});

test("[happy-1] accepts every descending subset of nonzero components", () => {
  const units = ["d", "h", "m", "s", "ms"];
  const counts = [4, 7, 23, 41, 683];
  const weights = [86400000, 3600000, 60000, 1000, 1];
  for (let mask = 1; mask < 32; mask++) {
    let text = "";
    let expected = 0;
    for (let i = 0; i < units.length; i++) {
      if ((mask & (1 << i)) !== 0) {
        text += `${counts[i]}${units[i]}`;
        expected += counts[i] * weights[i];
      }
    }
    assert.equal(parseDuration(text), expected, text);
  }
});

// Extends public "[boundary-1] trims spaces and a trailing newline".
test("[boundary-1] trims each ordinary whitespace character on either side", () => {
  for (const whitespace of [" ", "\t", "\r", "\n", "\v", "\f"]) {
    assert.equal(parseDuration(`${whitespace}7h9ms`), 25200009);
    assert.equal(parseDuration(`7h9ms${whitespace}`), 25200009);
    assert.equal(parseDuration(`${whitespace}7h9ms${whitespace}`), 25200009);
  }
});

// Extends public "[boundary-1] trims tabs and line breaks around zero".
test("[boundary-1] trims long mixed whitespace around zero and a nonzero value", () => {
  const padding = " \t\r\n\f\v".repeat(200);
  assert.equal(parseDuration(`${padding}0d0h0m0s0ms${padding}`), 0);
  assert.equal(parseDuration(`${padding}2d3s4ms${padding}`), 172803004);
});

// Extends public "[boundary-1] accepts input without surrounding whitespace".
test("[boundary-1] trims without losing edge digits of a compact input", () => {
  for (const text of ["18h21m", " 18h21m", "18h21m\t"]) {
    assert.equal(parseDuration(text), 66060000);
  }
});

// Extends public "[happy-2] allows ninety minutes".
test("[happy-2] accepts very large minute counts", () => {
  for (const minutes of [61, 999, 123456789]) {
    assert.equal(parseDuration(`${minutes}m`), minutes * 60000);
  }
});

// Extends public "[happy-2] allows seconds at the minute threshold".
test("[happy-2] accepts seconds across several minute and hour thresholds", () => {
  for (const seconds of [59, 61, 120, 3599, 3601, 86401]) {
    assert.equal(parseDuration(`${seconds}s`), seconds * 1000);
  }
});

// Extends public "[happy-2] allows minutes at the hour threshold".
test("[happy-2] accepts minutes spanning hours and days", () => {
  for (const minutes of [59, 61, 120, 1439, 1440, 1441]) {
    assert.equal(parseDuration(`${minutes}m`), minutes * 60000);
  }
});

// Extends public "[happy-2] allows hours at the day threshold".
test("[happy-2] accepts hours on both sides of day multiples", () => {
  for (const hours of [23, 25, 48, 1001, 1000000]) {
    assert.equal(parseDuration(`${hours}h`), hours * 3600000);
  }
});

// Extends public "[happy-2] allows milliseconds at the second threshold".
test("[happy-2] accepts millisecond counts spanning all larger units", () => {
  for (const ms of [1001, 60001, 3600001, 86400001, 9876543210]) {
    assert.equal(parseDuration(`${ms}ms`), ms);
  }
});

// Extends public "[happy-2] adds oversized counts in descending unit order".
test("[happy-2] adds simultaneous oversized counts in all five units", () => {
  assert.equal(parseDuration("2d49h121m3601s1001ms"), 360062001);
  assert.equal(parseDuration("99h999m9999s99999ms"), 426438999);
});

test("[happy-2] oversized lower counts still add to higher nonzero units", () => {
  assert.equal(parseDuration("1d86400001ms"), 172800001);
  assert.equal(parseDuration("2h7201s"), 14401000);
  assert.equal(parseDuration("3m180001ms"), 360001);
});
