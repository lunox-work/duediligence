import { test } from "node:test";
import assert from "node:assert/strict";
import { scanLicences } from "../../src/index.js";

function scanEntry(entry: Record<string, unknown>) {
  return scanLicences(
    JSON.stringify({ lockfileVersion: 3, packages: {} }),
    JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/private-pkg": entry } }),
  );
}

function expectLicence(license: string, reason?: "copyleft" | "unknown"): void {
  assert.deepEqual(scanEntry({ version: "4.5.6", license }), reason ? {
    passed: false,
    offenders: [{ name: "private-pkg", version: "4.5.6", licence: license, reason }],
  } : { passed: true, offenders: [] }, license);
}

// The spec says how to read legacy types but does not define the serialization
// of their licence field in an offender. Check the specified outcome and identity.
function expectLegacyFailure(entry: Record<string, unknown>, reason: "copyleft" | "unknown"): void {
  const result = scanEntry({ version: "4.5.6", ...entry });
  assert.equal(result.passed, false);
  assert.equal(result.offenders.length, 1);
  const offender = result.offenders[0]!;
  assert.deepEqual({ name: offender.name, version: offender.version, reason: offender.reason }, {
    name: "private-pkg", version: "4.5.6", reason,
  });
}

// Extends public "each stated permitted licence passes".
test("[happy-2] many added packages with permitted identifiers all pass together", () => {
  const identifiers = ["MIT", "Apache-2.0", "BSD-3-Clause", "ISC", "LGPL-3.0-only"];
  const packages: Record<string, unknown> = {};
  for (let i = 0; i < 75; i++) {
    packages[`node_modules/parent-${i}/node_modules/@s/permitted-${i}`] = {
      version: `2.${i}.0`, license: identifiers[i % identifiers.length], dev: false,
    };
  }
  assert.deepEqual(scanLicences(
    JSON.stringify({ lockfileVersion: 3, packages: {} }),
    JSON.stringify({ lockfileVersion: 3, packages }),
  ), { passed: true, offenders: [] });
});

// Extends public "each stated permitted licence passes" beyond its five examples.
test("[happy-2] other recognized permissive SPDX identifiers also pass", () => {
  for (const licence of ["BSD-2-Clause", "Zlib", "CC0-1.0", "Unlicense", "Apache-1.1"]) {
    expectLicence(licence);
  }
});

// Extends public "other LGPL identifiers are permitted by their prefix".
test("[happy-2] LGPL prefix permission is not a fixed list of known versions", () => {
  for (const licence of ["LGPL", "LGPLv99", "LGPL-9.9-only", "LGPL-custom-variant", "LGPL-2.0-or-later"]) {
    expectLicence(licence);
  }
});

// Extends public "each stated GPL and AGPL licence fails as copyleft".
test("[unhappy-1] additional GPL and AGPL versions retain their exact case and spelling", () => {
  for (const licence of ["GPL-1.0-only", "AGPL-1.0-or-later", "AGPL-3.0+", "gPl-2.0-OR-later", "agpl-3.0-only"]) {
    expectLicence(licence, "copyleft");
  }
});

// Extends public "GPL and AGPL prefixes are recognized without case or identifier allowlists".
test("[unhappy-1] bare and extended copyleft prefixes are recognized", () => {
  for (const licence of ["GPL", "AGPL", "GPLv99", "aGpLv7", "GPL-custom-variant", "AgPl-99.0-only"]) {
    expectLicence(licence, "copyleft");
  }
});

// Extends public "a Classpath exception does not permit GPL".
test("[boundary-3] different exceptions do not permit GPL or AGPL", () => {
  for (const licence of [
    "GPL-3.0-only WITH GCC-exception-3.1",
    "AGPL-3.0-only WITH Classpath-exception-2.0",
    "gpl-2.0-only WITH Autoconf-exception-2.0",
  ]) expectLicence(licence, "copyleft");
});

// Extends public "an exception leaves an LGPL licence permitted".
test("[boundary-3] exceptions preserve permitted LGPL prefixes and MIT", () => {
  for (const licence of [
    "LGPL-3.0-only WITH LLVM-exception",
    "LGPLv99 WITH GCC-exception-3.1",
    "MIT WITH Classpath-exception-2.0",
  ]) expectLicence(licence);
});

// Extends public "OR permits a choice of MIT over GPL in either operand order".
test("[boundary-4] a late permitted OR alternative wins after many copyleft alternatives", () => {
  const banned = Array.from({ length: 48 }, (_, i: number) => i % 2 ? "GPLv3" : "AGPL-3.0");
  expectLicence([...banned, "ISC"].join(" OR "));
  expectLicence(["BSD-3-Clause", ...banned].join(" OR "));
  expectLicence(banned.join(" OR "), "copyleft");
});

// Extends public "AND requires both licences to be permitted".
test("[boundary-4] long conjunctions require every operand including the first and last", () => {
  const permitted: string[] = Array.from({ length: 48 }, (_, i: number) => i % 2 ? "MIT" : "Apache-2.0");
  expectLicence(permitted.join(" AND "));
  for (const index of [0, 23, 47]) {
    const licences = [...permitted];
    licences[index] = "AGPL-3.0-only";
    expectLicence(licences.join(" AND "), "copyleft");
  }
});

// Extends public "parentheses group an OR before a required AGPL licence".
test("[boundary-4] a permitted OR group cannot override a separate required GPL group", () => {
  expectLicence("(AGPL-3.0 OR Apache-2.0 OR ISC) AND (GPL-2.0+ OR AGPL-3.0)", "copyleft");
  expectLicence("(GPL-2.0+ OR AGPL-3.0) AND (ISC OR MIT)", "copyleft");
});

// Extends public "AND binds more tightly than OR".
test("[boundary-4] AND precedence also holds when the permitted OR branch is last", () => {
  expectLicence("GPL-3.0-only AND MIT OR Apache-2.0");
  expectLicence("GPL-3.0-only AND MIT OR Apache-2.0 AND ISC");
  expectLicence("GPL-3.0-only OR MIT AND AGPL-3.0", "copyleft");
  expectLicence("GPL-3.0-only AND (MIT OR Apache-2.0)", "copyleft");
});

// Extends public "nested parentheses can override the default precedence".
test("[boundary-4] both groups must offer a permitted choice across the full truth table", () => {
  for (let bits = 0; bits < 16; bits++) {
    const a = (bits & 1) !== 0;
    const b = (bits & 2) !== 0;
    const c = (bits & 4) !== 0;
    const d = (bits & 8) !== 0;
    const expression = `(${a ? "MIT" : "GPLv3"} OR ${b ? "ISC" : "AGPL-3.0"}) AND (${c ? "BSD-3-Clause" : "GPL-2.0+"} OR ${d ? "Apache-2.0" : "AGPL-3.0-only"})`;
    expectLicence(expression, (a || b) && (c || d) ? undefined : "copyleft");
  }
});

test("[boundary-4] precedence follows both three-operand truth tables", () => {
  for (let bits = 0; bits < 8; bits++) {
    const a = (bits & 1) !== 0;
    const b = (bits & 2) !== 0;
    const c = (bits & 4) !== 0;
    const left = a ? "MIT" : "GPLv3";
    const middle = b ? "ISC" : "AGPL-3.0";
    const right = c ? "Apache-2.0" : "GPL-2.0+";
    expectLicence(`${left} OR ${middle} AND ${right}`, a || (b && c) ? undefined : "copyleft");
    expectLicence(`${left} AND ${middle} OR ${right}`, (a && b) || c ? undefined : "copyleft");
  }
});

test("[boundary-4] deeply nested expressions retain the innermost logical outcome", () => {
  const wrap = (expression: string) => "(".repeat(40) + expression + ")".repeat(40);
  expectLicence(wrap("GPLv3 OR ISC"));
  expectLicence(wrap("MIT AND AGPL-3.0"), "copyleft");
  expectLicence("(GPLv3 AND (MIT OR ISC)) OR ((AGPL-3.0 OR BSD-3-Clause) AND Apache-2.0)");
});

// Extends public "WITH binds to its licence before AND and OR".
test("[boundary-4] multiple exceptions bind locally within grouped choices and requirements", () => {
  expectLicence("(GPL-2.0-only WITH Classpath-exception-2.0 OR LGPL-3.0-only WITH GCC-exception-3.1) AND ISC");
  expectLicence("MIT AND (GPL-3.0-only WITH GCC-exception-3.1 OR AGPL-3.0 WITH LLVM-exception)", "copyleft");
  expectLicence("AGPL-3.0 WITH LLVM-exception AND MIT OR ISC WITH Classpath-exception-2.0");
});

// Extends public "a missing licence is unknown and reported as null".
test("[unhappy-2] other metadata cannot supply a missing licence", () => {
  assert.deepEqual(scanEntry({
    version: "4.5.6", dev: false,
    description: "MIT", resolved: "https://example.invalid/MIT.tgz", integrity: "GPLv3",
  }), {
    passed: false,
    offenders: [{ name: "private-pkg", version: "4.5.6", licence: null, reason: "unknown" }],
  });
});

// Extends public "empty and indeterminate licence strings fail as unknown".
test("[unhappy-2] varied indeterminate strings and whitespace cannot identify a licence", () => {
  for (const licence of [
    "   ", "LicenseRef-local-2026", "LicenseRef-MIT", "LicenseRef-GPL-3.0-only",
    "SEE LICENSE IN COPYING", "SEE LICENSE IN docs/COPYING.txt",
  ]) expectLicence(licence, "unknown");
});

// Extends public "malformed SPDX expressions fail as unknown even if they contain MIT or GPL".
test("[unhappy-2] repeated operators empty groups and extra closings invalidate the whole expression", () => {
  for (const licence of [
    "()", "( )", "MIT OR ()", "MIT AND AND ISC", "GPLv3 OR OR MIT",
    "(MIT))", "((GPLv3)", "MIT AND (ISC OR)", "MIT OR (AND GPLv3)",
    "MIT OR GPLv3)", "MIT OR (GPLv3 AND)", "MIT AND (ISC) Apache-2.0",
  ]) expectLicence(licence, "unknown");
});

test("[unhappy-2] a parser must consume trailing input even after a permitted OR branch", () => {
  for (const licence of [
    "MIT OR ISC trailing", "MIT OR (GPLv3) trailing", "MIT OR ISC OR",
    "MIT OR GPLv3 WITH", "MIT OR GPLv3 AND MIT extra",
    "MIT OR ISC;", "MIT || GPLv3", "MIT && ISC", "MIT, Apache-2.0",
  ]) expectLicence(licence, "unknown");
});

test("[unhappy-2] invalid WITH syntax is unknown rather than a copyleft verdict", () => {
  for (const licence of [
    "WITH Classpath-exception-2.0", "GPLv3 WITH WITH Classpath-exception-2.0",
    "GPL-2.0-only WITH Classpath-exception-2.0 WITH GCC-exception-2.0",
    "MIT OR GPL-2.0-only WITH (Classpath-exception-2.0)",
  ]) expectLicence(licence, "unknown");
});

// Extends public "an old-style license object is read through its type field".
test("[unhappy-2] legacy object types can be copyleft unknown or malformed", () => {
  expectLegacyFailure({ license: { type: "aGpLv9", url: "https://example.invalid/MIT" } }, "copyleft");
  expectLegacyFailure({ license: { type: "LicenseRef-internal" } }, "unknown");
  expectLegacyFailure({ license: { type: "MIT OR" } }, "unknown");
  expectLegacyFailure({ license: { type: "" } }, "unknown");
});

test("[unhappy-2] legacy object type expressions use the same SPDX precedence", () => {
  assert.deepEqual(scanEntry({ version: "4.5.6", license: {
    type: "GPLv3 AND MIT OR ISC", url: "https://example.invalid/GPL",
  } }), { passed: true, offenders: [] });
  expectLegacyFailure({ license: { type: "(GPLv3 OR MIT) AND AGPL-3.0" } }, "copyleft");
});

// Extends public "old-style licenses entries form an OR expression".
test("[unhappy-2] legacy arrays inspect all alternatives including a permitted last entry", () => {
  const copyleft = [{ type: "GPL-1.0-only" }, { type: "AGPL-3.0" }, { type: "GPLv3" }];
  for (const licenses of [
    [...copyleft, { type: "LGPLv99" }],
    [{ type: "ISC" }, ...copyleft],
  ]) {
    assert.deepEqual(scanEntry({ version: "4.5.6", licenses }), { passed: true, offenders: [] });
  }
  expectLegacyFailure({ licenses: copyleft }, "copyleft");
});

// Extends public "a single old-style licenses entry is sufficient to identify a licence".
test("[unhappy-2] singleton legacy arrays are not automatically treated as permissive", () => {
  expectLegacyFailure({ licenses: [{ type: "GPLv3" }] }, "copyleft");
  expectLegacyFailure({ licenses: [{ type: "UNLICENSED" }] }, "unknown");
  expectLegacyFailure({ licenses: [{ type: "MIT AND" }] }, "unknown");
  assert.deepEqual(scanEntry({ version: "4.5.6", licenses: [{ type: "LGPL-9.9-only" }] }), {
    passed: true, offenders: [],
  });
});

// Extends public "old-style licenses entries form an OR expression": an empty
// list supplies no type at all, hence no identifiable licence.
test("[unhappy-2] an empty legacy licenses array cannot identify a licence", () => {
  expectLegacyFailure({ licenses: [] }, "unknown");
});
