import { test } from "node:test";
import assert from "node:assert/strict";
import { scanLicences, type ScanResult } from "../../src/index.js";

/** Builds an npm lockfile version 3 text whose "packages" holds the project entry and the given entries. */
function lockfile(packages: Record<string, Record<string, unknown>>): string {
  return JSON.stringify({
    name: "app",
    version: "1.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: { "": { name: "app", version: "1.0.0" }, ...packages },
  });
}

/** The version's lockfile used where its contents do not matter to the test. */
const BASE = lockfile({ "node_modules/base": { version: "1.0.0", license: "MIT" } });

function scanOne(entry: Record<string, unknown>): ScanResult {
  return scanLicences(BASE, lockfile({ "node_modules/added": { version: "1.0.0", ...entry } }));
}

function assertPasses(license: string): void {
  assert.deepEqual(scanOne({ license }), { passed: true, offenders: [] }, license);
}

function assertFails(license: string, reason: "copyleft" | "unknown"): void {
  assert.deepEqual(
    scanOne({ license }),
    { passed: false, offenders: [{ name: "added", version: "1.0.0", licence: license, reason }] },
    license,
  );
}

test("[happy-2] permissive licences pass", () => {
  for (const license of ["MIT", "Apache-2.0", "BSD-3-Clause", "ISC", "LGPL-3.0-only"]) {
    assertPasses(license);
  }
});

test("[happy-2] any identifier starting LGPL passes", () => {
  assertPasses("LGPL-2.1-or-later");
  assertPasses("LGPL-2.0+");
});

test("[unhappy-1] GPL and AGPL licences fail as copyleft", () => {
  for (const license of ["GPL-3.0-only", "GPL-2.0-or-later", "AGPL-3.0", "GPL-2.0+", "gpl-3.0"]) {
    assertFails(license, "copyleft");
  }
});

test("[unhappy-1] identifiers starting GPL or AGPL in any case are copyleft", () => {
  assertFails("GPLv3", "copyleft");
  assertFails("agpl-3.0-or-later", "copyleft");
});

test("[boundary-3] a GPL licence with an exception fails as copyleft", () => {
  assertFails("GPL-2.0-only WITH Classpath-exception-2.0", "copyleft");
});

test("[boundary-3] WITH binds tighter than OR, so a GPL with exception offered beside MIT passes", () => {
  assertPasses("GPL-2.0-only WITH Classpath-exception-2.0 OR MIT");
});

test("[boundary-4] OR passes when one alternative is permitted", () => {
  assertPasses("MIT OR GPL-3.0-only");
});

test("[boundary-4] AND fails when one part is copyleft", () => {
  assertFails("MIT AND GPL-3.0-only", "copyleft");
});

test("[boundary-4] a parenthesised choice ANDed with AGPL fails as copyleft", () => {
  assertFails("(MIT OR GPL-3.0-only) AND AGPL-3.0", "copyleft");
});

test("[boundary-4] AND binds tighter than OR", () => {
  assertPasses("MIT OR GPL-3.0-only AND Apache-2.0");
});

test("[unhappy-2] a package with no licence fails as unknown with a null licence", () => {
  assert.deepEqual(scanOne({}), {
    passed: false,
    offenders: [{ name: "added", version: "1.0.0", licence: null, reason: "unknown" }],
  });
});

test("[unhappy-2] an empty licence fails as unknown", () => {
  const result = scanOne({ license: "" });
  assert.equal(result.passed, false);
  assert.equal(result.offenders.length, 1);
  assert.equal(result.offenders[0].name, "added");
  assert.equal(result.offenders[0].version, "1.0.0");
  assert.equal(result.offenders[0].reason, "unknown");
});

test("[unhappy-2] UNLICENSED, SEE LICENSE IN, LicenseRef- and unparseable expressions fail as unknown", () => {
  for (const license of [
    "UNLICENSED",
    "SEE LICENSE IN LICENSE.md",
    "LicenseRef-Proprietary",
    "MIT AND",
    "(MIT OR ISC",
    "MIT ISC",
  ]) {
    assertFails(license, "unknown");
  }
});

test("[unhappy-2] an old-style license object is read from its type field", () => {
  assert.deepEqual(scanOne({ license: { type: "MIT", url: "https://example.invalid" } }), {
    passed: true,
    offenders: [],
  });
  const result = scanOne({ license: { type: "GPL-3.0-only" } });
  assert.equal(result.passed, false);
  assert.equal(result.offenders.length, 1);
  assert.equal(result.offenders[0].name, "added");
  assert.equal(result.offenders[0].reason, "copyleft");
});

test("[unhappy-2] an old-style licenses array is read as each type joined by OR", () => {
  assert.deepEqual(scanOne({ licenses: [{ type: "GPL-3.0-only" }, { type: "MIT" }] }), {
    passed: true,
    offenders: [],
  });
  const result = scanOne({ licenses: [{ type: "GPL-2.0-only" }, { type: "AGPL-3.0" }] });
  assert.equal(result.passed, false);
  assert.equal(result.offenders.length, 1);
  assert.equal(result.offenders[0].name, "added");
  assert.equal(result.offenders[0].reason, "copyleft");
});
