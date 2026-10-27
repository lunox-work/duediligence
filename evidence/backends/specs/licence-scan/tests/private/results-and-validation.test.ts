import { test } from "node:test";
import assert from "node:assert/strict";
import { scanLicences } from "../../src/index.js";
import type { Offender } from "../../src/index.js";

function lock(packages: Record<string, unknown>): string {
  return JSON.stringify({ lockfileVersion: 3, packages });
}

// Extends public "all offenders are deduplicated and ordered by name then version".
test("[happy-3] a large mixed scan returns every new failing pair in stable order", () => {
  const baseline: Record<string, unknown> = {};
  const entries: [string, unknown][] = [];
  const offenders: Offender[] = [];
  for (let i = 0; i < 32; i++) {
    const name = `pkg-${String(i).padStart(2, "0")}`;
    baseline[`node_modules/old/node_modules/${name}`] = { version: "1.0.0", license: "MIT" };
    entries.push(
      [`node_modules/${name}`, { version: "1.0.0", license: "GPLv3" }],
      [`node_modules/a/node_modules/${name}`, { version: "2.0.0", license: "aGpL-3.0" }],
      [`node_modules/b/node_modules/${name}`, { version: "3.0.0" }],
      [`node_modules/c/node_modules/${name}`, { version: "2.0.0", license: "aGpL-3.0" }],
      [`node_modules/d/node_modules/${name}`, { version: "3.0.0" }],
      [`node_modules/e/node_modules/${name}`, { version: "4.0.0", license: "MIT" }],
      [`node_modules/f/node_modules/${name}`, { version: "5.0.0", dev: true, license: "GPLv3" }],
    );
    offenders.push(
      { name, version: "2.0.0", licence: "aGpL-3.0", reason: "copyleft" },
      { name, version: "3.0.0", licence: null, reason: "unknown" },
    );
  }
  for (const ordered of [entries, [...entries].reverse()]) {
    assert.deepEqual(scanLicences(lock(baseline), lock(Object.fromEntries(ordered))), {
      passed: false, offenders,
    });
  }
});

test("[happy-3] duplicate paths collapse only equal name and version pairs", () => {
  const entries: [string, unknown][] = [
    ["node_modules/z/node_modules/@s/pkg", { version: "3.0.0", license: "GPLv3" }],
    ["node_modules/zz", { version: "2.0.0", license: "UNLICENSED" }],
    ["node_modules/@s/pkg", { version: "1.0.0", license: "GPLv3" }],
    ["node_modules/a/node_modules/@s/pkg", { version: "3.0.0", license: "GPLv3" }],
    ["node_modules/@t/pkg", { version: "1.0.0", license: "GPLv3" }],
    ["node_modules/pkg", { version: "1.0.0", license: "GPLv3" }],
    ["node_modules/b/node_modules/@s/pkg", { version: "2.0.0", license: "GPLv3" }],
    ["node_modules/c/node_modules/@s/pkg", { version: "1.0.0", license: "GPLv3" }],
  ];
  const offenders: Offender[] = [
    { name: "@s/pkg", version: "1.0.0", licence: "GPLv3", reason: "copyleft" },
    { name: "@s/pkg", version: "2.0.0", licence: "GPLv3", reason: "copyleft" },
    { name: "@s/pkg", version: "3.0.0", licence: "GPLv3", reason: "copyleft" },
    { name: "@t/pkg", version: "1.0.0", licence: "GPLv3", reason: "copyleft" },
    { name: "pkg", version: "1.0.0", licence: "GPLv3", reason: "copyleft" },
    { name: "zz", version: "2.0.0", licence: "UNLICENSED", reason: "unknown" },
  ];
  for (const ordered of [entries, [...entries].reverse(), [...entries.slice(3), ...entries.slice(0, 3)]]) {
    assert.deepEqual(scanLicences(lock({}), lock(Object.fromEntries(ordered))), { passed: false, offenders });
  }
});

// Extends public "an empty dependency set passes and the project entry is never scanned".
test("[happy-3] root metadata does not obscure the results of real dependencies", () => {
  assert.deepEqual(scanLicences(lock({ "": { version: "1.0.0" } }), lock({
    "": { version: "9.0.0", license: "MIT AND" },
    "node_modules/good": { version: "2.0.0", license: "ISC" },
    "node_modules/bad": { version: "2.0.0", license: "GPLv3" },
  })), {
    passed: false,
    offenders: [{ name: "bad", version: "2.0.0", licence: "GPLv3", reason: "copyleft" }],
  });
  assert.deepEqual(scanLicences(lock({}), lock({
    "": { version: "9.0.0" },
    "node_modules/good": { version: "2.0.0", license: "ISC" },
  })), { passed: true, offenders: [] });
});

test("[happy-3] a baseline project name and version never exempt an added dependency", () => {
  assert.deepEqual(scanLicences(lock({
    "": { name: "same-name", version: "3.0.0", license: "MIT" },
  }), lock({
    "": { name: "different-project", version: "1.0.0" },
    "node_modules/same-name": { version: "3.0.0", license: "AGPL-3.0" },
  })), {
    passed: false,
    offenders: [{ name: "same-name", version: "3.0.0", licence: "AGPL-3.0", reason: "copyleft" }],
  });
});

// Extends public "an offending compound expression is reported exactly as written".
test("[happy-3] reports preserve redundant grouping spacing and identifier case", () => {
  const licence = "  ((MIT OR gPl-3.0-only)  AND  AGPL-3.0 WITH LLVM-exception)  ";
  assert.deepEqual(scanLicences(lock({}), lock({
    "node_modules/exact": { version: "6.7.8-beta.4", license: licence },
  })), {
    passed: false,
    offenders: [{ name: "exact", version: "6.7.8-beta.4", licence, reason: "copyleft" }],
  });
});

test("[happy-3] unknown licence text is preserved distinctly from an absent licence", () => {
  assert.deepEqual(scanLicences(lock({}), lock({
    "node_modules/c-missing": { version: "1.0.0" },
    "node_modules/b-malformed": { version: "2.0.0", license: "MIT OR (GPLv3 AND)" },
    "node_modules/a-empty": { version: "3.0.0", license: "" },
  })), {
    passed: false,
    offenders: [
      { name: "a-empty", version: "3.0.0", licence: "", reason: "unknown" },
      { name: "b-malformed", version: "2.0.0", licence: "MIT OR (GPLv3 AND)", reason: "unknown" },
      { name: "c-missing", version: "1.0.0", licence: null, reason: "unknown" },
    ],
  });
});

test("[happy-3] independent scans cannot retain baseline pairs or prior offenders", () => {
  const empty = lock({});
  const bad = lock({ "node_modules/transient": { version: "1.0.0", license: "GPLv3" } });
  assert.deepEqual(scanLicences(bad, bad), { passed: true, offenders: [] });
  assert.deepEqual(scanLicences(empty, bad), {
    passed: false,
    offenders: [{ name: "transient", version: "1.0.0", licence: "GPLv3", reason: "copyleft" }],
  });
  assert.deepEqual(scanLicences(empty, empty), { passed: true, offenders: [] });
  assert.deepEqual(scanLicences(bad, bad), { passed: true, offenders: [] });
});

// No diagnostic text or subclass is prescribed for unreadable lockfiles. Require
// an actual Error and reject the placeholder explicitly, without inventing a
// diagnostic contract. Each validation test also makes a successful valid call.
function expectUnreadable(version: string, submission: string): void {
  assert.throws(() => scanLicences(version, submission), (error: unknown) => {
    assert.ok(error instanceof Error, "an unreadable lockfile must raise an Error");
    assert.notEqual((error as Error).message, "not implemented", "the interface placeholder is not validation");
    return true;
  });
}

// Extends public "invalid JSON in either lockfile throws an error".
test("[unhappy-3] malformed JSON is rejected even after valid-looking lockfile fields", () => {
  const valid = lock({});
  assert.deepEqual(scanLicences(valid, valid), { passed: true, offenders: [] });
  for (const invalid of [
    '{"lockfileVersion":3,"packages":{},}',
    '{"lockfileVersion":3,"packages":{}} trailing',
    '{"lockfileVersion":3,"packages":{"node_modules/p":{"version":"1.0.0",}}}',
    '{"lockfileVersion":3,"packages":{}} {"lockfileVersion":3,"packages":{}}',
    '{"lockfileVersion":3,"packages":{},"name":"unterminated}',
  ]) {
    expectUnreadable(invalid, valid);
    expectUnreadable(valid, invalid);
  }
});

// Extends public "missing or non-object packages in either lockfile throws an error".
test("[unhappy-3] primitive documents and non-map packages are rejected on both sides", () => {
  const valid = lock({});
  assert.deepEqual(scanLicences(valid, valid), { passed: true, offenders: [] });
  for (const document of [
    null, true, 42, "a string", [],
    { lockfileVersion: 3, dependencies: {} },
    { lockfileVersion: 3, packages: false },
    { lockfileVersion: 3, packages: 0 },
    { lockfileVersion: 3, packages: [] },
    { lockfileVersion: 3, packages: [{ version: "1.0.0", license: "MIT" }] },
  ]) {
    const invalid = JSON.stringify(document);
    expectUnreadable(invalid, valid);
    expectUnreadable(valid, invalid);
  }
});

// Extends public "lockfile versions other than numeric 3 are refused on either side".
test("[unhappy-3] version validation rejects coercible and fractional values", () => {
  const valid = lock({});
  assert.deepEqual(scanLicences(valid, valid), { passed: true, offenders: [] });
  for (const lockfileVersion of [0, 1, -3, 3.1, 30, null, false, true, "03", "3.0", [3], { value: 3 }]) {
    const invalid = JSON.stringify({ lockfileVersion, packages: {} });
    expectUnreadable(invalid, valid);
    expectUnreadable(valid, invalid);
  }
});

test("[unhappy-3] identical invalid inputs are validated before any equality shortcut", () => {
  const valid = lock({});
  assert.deepEqual(scanLicences(valid, valid), { passed: true, offenders: [] });
  for (const invalid of [
    "[invalid JSON]", JSON.stringify({ lockfileVersion: 3 }),
    JSON.stringify({ lockfileVersion: 2, packages: {} }),
  ]) expectUnreadable(invalid, invalid);
});

test("[unhappy-3] invalid baseline is refused even when submission has no scannable entries", () => {
  const empty = lock({});
  assert.deepEqual(scanLicences(empty, empty), { passed: true, offenders: [] });
  const noScannableEntries = [empty, lock({
    "": { version: "1.0.0" },
    "node_modules/dev-only": { version: "2.0.0", dev: true, license: "GPLv3" },
  })];
  for (const baseline of ["{", JSON.stringify({ packages: {} }), JSON.stringify({ lockfileVersion: 3 })]) {
    for (const submission of noScannableEntries) expectUnreadable(baseline, submission);
  }
});
