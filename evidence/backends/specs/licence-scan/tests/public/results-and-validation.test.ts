import { test } from "node:test";
import assert from "node:assert/strict";
import { scanLicences } from "../../src/index.js";

function lock(packages: Record<string, unknown>): string {
  return JSON.stringify({ lockfileVersion: 3, packages });
}

test("[happy-3] all offenders are deduplicated and ordered by name then version", () => {
  const submission = lock({
    "node_modules/zebra": { version: "1.0.0" },
    "node_modules/alpha": { version: "2.0.0", license: "GPL-3.0-only" },
    "node_modules/parent/node_modules/@scope/pkg": { version: "1.0.0", license: "gpl-3.0" },
    "node_modules/other/node_modules/alpha": { version: "1.0.0", license: "UNLICENSED" },
    "node_modules/alpha/node_modules/zebra": { version: "1.0.0" },
    "node_modules/permitted": { version: "1.0.0", license: "MIT" },
    "node_modules/@scope/pkg": { version: "1.0.0", license: "gpl-3.0" },
  });

  assert.deepEqual(scanLicences(lock({}), submission), {
    passed: false,
    offenders: [
      { name: "@scope/pkg", version: "1.0.0", licence: "gpl-3.0", reason: "copyleft" },
      { name: "alpha", version: "1.0.0", licence: "UNLICENSED", reason: "unknown" },
      { name: "alpha", version: "2.0.0", licence: "GPL-3.0-only", reason: "copyleft" },
      { name: "zebra", version: "1.0.0", licence: null, reason: "unknown" },
    ],
  });
});

test("[happy-3] an empty dependency set passes and the project entry is never scanned", () => {
  assert.deepEqual(scanLicences(lock({}), lock({})), { passed: true, offenders: [] });
  assert.deepEqual(scanLicences(
    lock({ "": { version: "1.0.0", license: "MIT" } }),
    lock({ "": { version: "2.0.0", license: "AGPL-3.0" } }),
  ), { passed: true, offenders: [] });
});

test("[happy-3] an offending compound expression is reported exactly as written", () => {
  const license = "(MIT OR GPL-3.0-only) AND AGPL-3.0";
  assert.deepEqual(scanLicences(lock({}), lock({
    "node_modules/pkg": { version: "1.0.0", license },
  })), {
    passed: false,
    offenders: [{ name: "pkg", version: "1.0.0", licence: license, reason: "copyleft" }],
  });
});

test("[unhappy-3] invalid JSON in either lockfile throws an error", () => {
  const valid = lock({});
  for (const invalid of ["", "not JSON", "{"]) {
    assert.throws(() => scanLicences(invalid, valid), Error);
    assert.throws(() => scanLicences(valid, invalid), Error);
  }
});

test("[unhappy-3] missing or non-object packages in either lockfile throws an error", () => {
  const valid = lock({});
  for (const document of [
    { lockfileVersion: 3 },
    { lockfileVersion: 3, packages: null },
    { lockfileVersion: 3, packages: "not an object" },
  ]) {
    const invalid = JSON.stringify(document);
    assert.throws(() => scanLicences(invalid, valid), Error);
    assert.throws(() => scanLicences(valid, invalid), Error);
  }
});

test("[unhappy-3] lockfile versions other than numeric 3 are refused on either side", () => {
  const valid = lock({});
  for (const document of [
    { packages: {} },
    { lockfileVersion: 2, packages: {} },
    { lockfileVersion: 4, packages: {} },
    { lockfileVersion: "3", packages: {} },
  ]) {
    const invalid = JSON.stringify(document);
    assert.throws(() => scanLicences(invalid, valid), Error);
    assert.throws(() => scanLicences(valid, invalid), Error);
  }
});
