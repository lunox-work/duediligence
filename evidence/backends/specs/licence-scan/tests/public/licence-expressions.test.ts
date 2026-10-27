import { test } from "node:test";
import assert from "node:assert/strict";
import { scanLicences } from "../../src/index.js";

function scanEntry(entry: Record<string, unknown>) {
  return scanLicences(
    JSON.stringify({ lockfileVersion: 3, packages: {} }),
    JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/pkg": entry } }),
  );
}

function scanLicence(license: unknown) {
  return scanEntry({ version: "1.0.0", license });
}

function expectFailure(license: string, reason: "copyleft" | "unknown"): void {
  assert.deepEqual(scanLicence(license), {
    passed: false,
    offenders: [{ name: "pkg", version: "1.0.0", licence: license, reason }],
  }, license);
}

test("[happy-2] each stated permitted licence passes", () => {
  for (const license of ["MIT", "Apache-2.0", "BSD-3-Clause", "ISC", "LGPL-3.0-only"]) {
    assert.deepEqual(scanLicence(license), { passed: true, offenders: [] }, license);
  }
});

test("[happy-2] other LGPL identifiers are permitted by their prefix", () => {
  for (const license of ["LGPL-2.1-only", "LGPL-3.0+", "LGPLv3"]) {
    assert.deepEqual(scanLicence(license), { passed: true, offenders: [] }, license);
  }
});

test("[unhappy-1] each stated GPL and AGPL licence fails as copyleft", () => {
  for (const license of ["GPL-3.0-only", "GPL-2.0-or-later", "AGPL-3.0", "GPL-2.0+", "gpl-3.0"]) {
    expectFailure(license, "copyleft");
  }
});

test("[unhappy-1] GPL and AGPL prefixes are recognized without case or identifier allowlists", () => {
  for (const license of ["GPLv3", "aGpL-3.0-only", "gPlV3"]) {
    expectFailure(license, "copyleft");
  }
});

test("[boundary-3] a Classpath exception does not permit GPL", () => {
  expectFailure("GPL-2.0-only WITH Classpath-exception-2.0", "copyleft");
});

test("[boundary-3] an exception leaves an LGPL licence permitted", () => {
  assert.deepEqual(scanLicence("LGPL-2.1-only WITH GCC-exception-2.0"), {
    passed: true,
    offenders: [],
  });
});

test("[boundary-4] OR permits a choice of MIT over GPL in either operand order", () => {
  for (const license of ["MIT OR GPL-3.0-only", "GPL-3.0-only OR MIT"]) {
    assert.deepEqual(scanLicence(license), { passed: true, offenders: [] }, license);
  }
});

test("[boundary-4] AND requires both licences to be permitted", () => {
  expectFailure("MIT AND GPL-3.0-only", "copyleft");
  assert.deepEqual(scanLicence("MIT AND Apache-2.0"), { passed: true, offenders: [] });
});

test("[boundary-4] parentheses group an OR before a required AGPL licence", () => {
  expectFailure("(MIT OR GPL-3.0-only) AND AGPL-3.0", "copyleft");
});

test("[boundary-4] AND binds more tightly than OR", () => {
  assert.deepEqual(scanLicence("MIT OR GPL-3.0-only AND Apache-2.0"), {
    passed: true,
    offenders: [],
  });
});

test("[boundary-4] nested parentheses can override the default precedence", () => {
  expectFailure("((MIT OR GPL-3.0-only) AND AGPL-3.0)", "copyleft");
  assert.deepEqual(scanLicence("(MIT OR GPL-3.0-only) AND (Apache-2.0 OR AGPL-3.0)"), {
    passed: true,
    offenders: [],
  });
});

test("[boundary-4] WITH binds to its licence before AND and OR", () => {
  expectFailure("GPL-2.0-only WITH Classpath-exception-2.0 AND MIT", "copyleft");
  assert.deepEqual(scanLicence("GPL-2.0-only WITH Classpath-exception-2.0 OR MIT"), {
    passed: true,
    offenders: [],
  });
});

test("[unhappy-2] a missing licence is unknown and reported as null", () => {
  assert.deepEqual(scanEntry({ version: "1.0.0" }), {
    passed: false,
    offenders: [{ name: "pkg", version: "1.0.0", licence: null, reason: "unknown" }],
  });
});

test("[unhappy-2] empty and indeterminate licence strings fail as unknown", () => {
  for (const license of ["", "UNLICENSED", "SEE LICENSE IN LICENSE.md", "LicenseRef-custom"]) {
    expectFailure(license, "unknown");
  }
});

test("[unhappy-2] malformed SPDX expressions fail as unknown even if they contain MIT or GPL", () => {
  for (const license of [
    "MIT OR", "AND MIT", "(MIT OR GPL-3.0-only", "MIT)",
    "MIT Apache-2.0", "GPL-3.0-only AND", "GPL-2.0-only WITH",
  ]) {
    expectFailure(license, "unknown");
  }
});

test("[unhappy-2] an old-style license object is read through its type field", () => {
  assert.deepEqual(scanLicence({ type: "MIT", url: "https://example.invalid/licence" }), {
    passed: true,
    offenders: [],
  });
});

test("[unhappy-2] old-style licenses entries form an OR expression", () => {
  assert.deepEqual(scanEntry({
    version: "1.0.0",
    licenses: [{ type: "GPL-3.0-only" }, { type: "MIT" }],
  }), { passed: true, offenders: [] });
});

test("[unhappy-2] a single old-style licenses entry is sufficient to identify a licence", () => {
  assert.deepEqual(scanEntry({ version: "1.0.0", licenses: [{ type: "Apache-2.0" }] }), {
    passed: true,
    offenders: [],
  });
});
