import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDuration, formatDuration } from "../../src/index.js";

// R4 explicitly requires largest units first and zero components omitted.
// Extends public "[happy-3] formats zero as milliseconds".
test("[happy-3] formats zero identically before and after nonzero calls", () => {
  assert.equal(formatDuration(0), "0ms");
  assert.equal(formatDuration(7200002), "2h2ms");
  assert.equal(formatDuration(0), "0ms");
  assert.equal(formatDuration(3003), "3s3ms");
  assert.equal(formatDuration(0), "0ms");
});

// Extends public "[happy-3] formats milliseconds".
test("[happy-3] formats multiple digit subsecond values without leading zeros", () => {
  for (const ms of [2, 7, 10, 42, 100, 507, 998]) {
    assert.equal(formatDuration(ms), `${ms}ms`);
  }
});

// Extends public "[happy-3] formats seconds using minutes and seconds".
test("[happy-3] decomposes varied minute and second counts", () => {
  assert.equal(formatDuration(121000), "2m1s");
  assert.equal(formatDuration(3598000), "59m58s");
  assert.equal(formatDuration(737000), "12m17s");
});

// Extends public "[happy-3] formats hours and minutes while omitting zero units".
test("[happy-3] omits zero seconds and milliseconds across hour values", () => {
  assert.equal(formatDuration(46020000), "12h47m");
  assert.equal(formatDuration(7200000), "2h");
  assert.equal(formatDuration(86280000), "23h58m");
});

// Extends public "[happy-3] formats an exact day".
test("[happy-3] formats exact multiple days without artificial larger units", () => {
  for (const days of [2, 7, 30, 365, 100000]) {
    assert.equal(formatDuration(days * 86400000), `${days}d`);
  }
});

// Extends public "[happy-3] formats all five nonzero components".
test("[happy-3] formats five distinct multi digit component counts", () => {
  assert.equal(formatDuration(1084455678), "12d13h14m15s678ms");
  assert.equal(formatDuration(691198987), "7d23h59m58s987ms");
  assert.equal(formatDuration(1066573645), "12d8h16m13s645ms");
});

// Extends public "[happy-3] formats the smallest positive value".
test("[happy-3] formats one millisecond remainders at several larger scales", () => {
  assert.equal(formatDuration(60001), "1m1ms");
  assert.equal(formatDuration(3600001), "1h1ms");
  assert.equal(formatDuration(172800001), "2d1ms");
});

// Extends public "[happy-3] formats just below a second".
test("[happy-3] formats just below multiple second boundaries", () => {
  assert.equal(formatDuration(1999), "1s999ms");
  assert.equal(formatDuration(5999), "5s999ms");
  assert.equal(formatDuration(58999), "58s999ms");
});

// Extends public "[happy-3] formats an exact second".
test("[happy-3] formats varied exact second multiples", () => {
  assert.equal(formatDuration(2000), "2s");
  assert.equal(formatDuration(17000), "17s");
  assert.equal(formatDuration(59000), "59s");
});

// Extends public "[happy-3] formats just above a second".
test("[happy-3] preserves small remainders without padding", () => {
  assert.equal(formatDuration(2001), "2s1ms");
  assert.equal(formatDuration(3007), "3s7ms");
  assert.equal(formatDuration(59017), "59s17ms");
});

// Extends public "[happy-3] formats just below a minute".
test("[happy-3] formats one millisecond below hour and day transitions", () => {
  assert.equal(formatDuration(119999), "1m59s999ms");
  assert.equal(formatDuration(3599999), "59m59s999ms");
  assert.equal(formatDuration(86399999), "23h59m59s999ms");
  assert.equal(formatDuration(172799999), "1d23h59m59s999ms");
});

// Extends public "[happy-3] formats an exact minute".
test("[happy-3] formats exact minute multiples without second components", () => {
  assert.equal(formatDuration(120000), "2m");
  assert.equal(formatDuration(3540000), "59m");
  assert.equal(formatDuration(3660000), "1h1m");
  assert.equal(formatDuration(86460000), "1d1m");
});

// Extends public "[happy-3] formats an exact hour".
test("[happy-3] carries exact hours into days", () => {
  assert.equal(formatDuration(82800000), "23h");
  assert.equal(formatDuration(90000000), "1d1h");
  assert.equal(formatDuration(176400000), "2d1h");
  assert.equal(formatDuration(360000000), "4d4h");
});

// Extends public "[happy-3] omits zero units between nonzero components".
test("[happy-3] omits every possible combination of zero unit positions", () => {
  const units = ["d", "h", "m", "s", "ms"];
  const counts = [13, 17, 29, 43, 857];
  const weights = [86400000, 3600000, 60000, 1000, 1];
  for (let mask = 1; mask < 32; mask++) {
    let ms = 0;
    let expected = "";
    for (let i = 0; i < units.length; i++) {
      if ((mask & (1 << i)) !== 0) {
        ms += counts[i] * weights[i];
        expected += `${counts[i]}${units[i]}`;
      }
    }
    assert.equal(formatDuration(ms), expected);
  }
});

test("[happy-3] uses largest units even when another spelling has fewer characters", () => {
  // R4 specifies the decomposition; character count alone is not the rule.
  assert.equal(formatDuration(9000000), "2h30m");
  assert.equal(formatDuration(91800000), "1d1h30m");
  assert.equal(formatDuration(111000), "1m51s");
});

test("[happy-3] formats values above 32 bit limits without truncation", () => {
  assert.equal(formatDuration(2147483648), "24d20h31m23s648ms");
  assert.equal(formatDuration(4294967296), "49d17h2m47s296ms");
  assert.equal(formatDuration(1000000000000), "11574d1h46m40s");
});

// Extends public "[boundary-4] round trips the specified mixed duration".
test("[boundary-4] round trips varied deterministic mixed durations", () => {
  for (const ms of [987654321, 135792468, 246813579, 2000000000001, 7777777777777777]) {
    assert.equal(parseDuration(formatDuration(ms)), ms);
  }
});

// Extends public "[boundary-4] round trips zero".
test("[boundary-4] zero components collapse to the canonical zero and round trip", () => {
  for (const text of ["0d", "0h0s", "0m0ms", " 0d0h0m0s0ms\n"]) {
    const ms = parseDuration(text);
    assert.equal(ms, 0);
    const formatted = formatDuration(ms);
    assert.equal(formatted, "0ms");
    assert.equal(parseDuration(formatted), 0);
  }
});

// Extends public "[boundary-4] round trips the smallest positive duration".
test("[boundary-4] round trips both sides of all unit boundaries", () => {
  for (const threshold of [1000, 60000, 3600000, 86400000]) {
    for (const multiple of [1, 2, 7, 31]) {
      for (const offset of [-1, 0, 1]) {
        const ms = threshold * multiple + offset;
        assert.equal(parseDuration(formatDuration(ms)), ms);
      }
    }
  }
  for (let ms = 2; ms <= 33; ms++) assert.equal(parseDuration(formatDuration(ms)), ms);
});

// Extends public "[boundary-4] round trips the largest safe integer".
test("[boundary-4] round trips safe high precision values and powers of two", () => {
  for (const offset of [2, 3, 17, 255, 991, 992, 1001, 60001, 86400001]) {
    const ms = Number.MAX_SAFE_INTEGER - offset;
    assert.equal(parseDuration(formatDuration(ms)), ms);
  }
  for (const exponent of [31, 32, 40, 48, 52]) {
    for (const offset of [-1, 0, 1]) {
      const ms = 2 ** exponent + offset;
      assert.equal(parseDuration(formatDuration(ms)), ms);
    }
  }
});

test("[boundary-4] normalizes oversized counts then preserves their exact sum", () => {
  const cases: [string, string, number][] = [
    ["150m", "2h30m", 9000000],
    ["1h3601s1001ms", "2h2s1ms", 7202001],
    ["49h120m120s1000ms", "2d3h2m1s", 183721000],
    ["1d86400001ms", "2d1ms", 172800001],
  ];
  for (const [text, canonical, ms] of cases) {
    assert.equal(parseDuration(text), ms);
    assert.equal(formatDuration(ms), canonical);
    assert.equal(parseDuration(canonical), ms);
  }
});
