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

/** Asserts the one added package fails for the reason given, without asserting how its licence is reported. */
function assertFailsAs(entry: Record<string, unknown>, reason: "copyleft" | "unknown", label: string): void {
  const result = scanOne(entry);
  assert.equal(result.passed, false, label);
  assert.equal(result.offenders.length, 1, label);
  assert.equal(result.offenders[0].name, "added", label);
  assert.equal(result.offenders[0].version, "1.0.0", label);
  assert.equal(result.offenders[0].reason, reason, label);
}

// Extends public "[happy-2] permissive licences pass".
test("[happy-2] other permissive licences pass", () => {
  for (const license of [
    "BSD-2-Clause",
    "0BSD",
    "Unlicense",
    "CC0-1.0",
    "MPL-2.0",
    "EPL-2.0",
    "Zlib",
    "Python-2.0",
    "BlueOak-1.0.0",
    "Artistic-2.0",
  ]) {
    assertPasses(license);
  }
});

// Extends public "[happy-2] any identifier starting LGPL passes".
test("[happy-2] LGPL identifiers of every version and form pass", () => {
  for (const license of ["LGPL-2.0-only", "LGPL-2.1-only", "LGPL-2.1", "LGPL-3.0", "LGPL-3.0-or-later", "LGPL-2.0-or-later"]) {
    assertPasses(license);
  }
});

// Extends public "[happy-2] permissive licences pass": permissive licences combined in expressions.
test("[happy-2] expressions made only of permissive licences pass", () => {
  for (const license of [
    "MIT AND ISC",
    "(MIT OR Apache-2.0) AND BSD-3-Clause",
    "LGPL-2.1-only AND MIT",
    "(LGPL-3.0-only)",
    "Apache-2.0 WITH LLVM-exception",
    "MIT OR LGPL-3.0-or-later",
  ]) {
    assertPasses(license);
  }
});

// Extends public "[happy-2] permissive licences pass": several added packages scanned together.
test("[happy-2] several added permissive packages pass together", () => {
  const submission = lockfile({
    "node_modules/one": { version: "1.0.0", license: "MIT" },
    "node_modules/two": { version: "2.0.0", license: "Apache-2.0" },
    "node_modules/one/node_modules/three": { version: "3.0.0", license: "LGPL-2.1-or-later" },
    "node_modules/@s/four": { version: "4.0.0", license: "ISC OR GPL-3.0-only" },
    "node_modules/five": { version: "5.0.0", license: { type: "BSD-3-Clause" } },
  });
  assert.deepEqual(scanLicences(BASE, submission), { passed: true, offenders: [] });
});

// Extends public "[unhappy-1] GPL and AGPL licences fail as copyleft".
test("[unhappy-1] other GPL and AGPL identifiers fail as copyleft", () => {
  for (const license of [
    "GPL-1.0",
    "GPL-2.0",
    "GPL-2.0-only",
    "GPL-3.0",
    "GPL-3.0-or-later",
    "GPL-3.0+",
    "AGPL-1.0",
    "AGPL-3.0-only",
    "AGPL-3.0-or-later",
    "GPL-2.0-with-classpath-exception",
  ]) {
    assertFails(license, "copyleft");
  }
});

// Extends public "[unhappy-1] identifiers starting GPL or AGPL in any case are copyleft".
test("[unhappy-1] copyleft identifiers in mixed case fail as copyleft", () => {
  for (const license of ["Gpl-2.0-only", "aGpL-3.0", "AGPLv3", "gplv2", "GPL"]) {
    assertFails(license, "copyleft");
  }
});

// Extends public "[unhappy-1] GPL and AGPL licences fail as copyleft": the copyleft licence in parentheses.
test("[unhappy-1] a copyleft licence in parentheses fails as copyleft", () => {
  assertFails("(GPL-3.0-only)", "copyleft");
  assertFails("((AGPL-3.0-only))", "copyleft");
});

// Extends public "[unhappy-1] GPL and AGPL licences fail as copyleft": no alternative is permitted.
test("[unhappy-1] a choice between copyleft licences only fails as copyleft", () => {
  assertFails("GPL-2.0-only OR AGPL-3.0", "copyleft");
  assertFails("GPL-2.0-only OR GPL-3.0-only OR AGPL-3.0-or-later", "copyleft");
});

// Extends public "[boundary-3] a GPL licence with an exception fails as copyleft".
test("[boundary-3] GPL and AGPL licences with other exceptions fail as copyleft", () => {
  for (const license of [
    "GPL-3.0-only WITH GCC-exception-3.1",
    "GPL-2.0-or-later WITH Bison-exception-2.2",
    "GPL-3.0-or-later WITH Autoconf-exception-3.0",
    "gpl-2.0-only WITH Classpath-exception-2.0",
  ]) {
    assertFails(license, "copyleft");
  }
});

// Extends public "[boundary-3] a GPL licence with an exception fails as copyleft":
// an exception named after the GPL does not make a permissive licence copyleft.
test("[boundary-3] a permissive licence with an exception named after the GPL passes", () => {
  assertPasses("Apache-2.0 WITH GPL-3.0-linking-exception");
  assertPasses("LGPL-3.0-only WITH LGPL-3.0-linking-exception");
});

// Extends public "[boundary-3] a GPL licence with an exception fails as copyleft": the exception inside an AND.
test("[boundary-3] a GPL licence with an exception ANDed with MIT fails as copyleft", () => {
  assertFails("MIT AND GPL-2.0-only WITH Classpath-exception-2.0", "copyleft");
  assertFails("GPL-2.0-only WITH Classpath-exception-2.0 AND MIT", "copyleft");
});

// Extends public "[boundary-3] WITH binds tighter than OR, so a GPL with exception offered beside MIT passes".
test("[boundary-3] MIT offered before a GPL with exception passes", () => {
  assertPasses("MIT OR GPL-2.0-only WITH Classpath-exception-2.0");
  assertPasses("(GPL-2.0-only WITH Classpath-exception-2.0) OR ISC");
});

// Extends public "[boundary-4] OR passes when one alternative is permitted".
test("[boundary-4] OR passes whichever side the permitted alternative is on", () => {
  assertPasses("GPL-3.0-only OR MIT");
  assertPasses("AGPL-3.0 OR GPL-2.0-only OR ISC");
  assertPasses("GPL-2.0-only OR Apache-2.0 OR AGPL-3.0");
});

// Extends public "[boundary-4] AND fails when one part is copyleft".
test("[boundary-4] AND fails whichever part is copyleft", () => {
  assertFails("GPL-3.0-only AND MIT", "copyleft");
  assertFails("MIT AND ISC AND AGPL-3.0", "copyleft");
  assertFails("MIT AND GPL-2.0-or-later AND ISC", "copyleft");
});

// Extends public "[boundary-4] AND binds tighter than OR": reading left to right would fail this one.
test("[boundary-4] AND binds tighter than OR when the copyleft part comes last", () => {
  assertPasses("MIT OR Apache-2.0 AND GPL-3.0-only");
});

// Extends public "[boundary-4] AND binds tighter than OR": reading right to left would fail this one.
test("[boundary-4] AND binds tighter than OR when the copyleft part comes first", () => {
  assertPasses("GPL-3.0-only AND Apache-2.0 OR MIT");
});

// Extends public "[boundary-4] AND binds tighter than OR": no alternative is free of copyleft.
test("[boundary-4] each OR alternative holding a copyleft AND part fails as copyleft", () => {
  assertFails("MIT AND GPL-3.0-only OR ISC AND AGPL-3.0", "copyleft");
});

// Extends public "[boundary-4] a parenthesised choice ANDed with AGPL fails as copyleft".
test("[boundary-4] parentheses override precedence", () => {
  assertFails("(MIT OR Apache-2.0) AND GPL-3.0-only", "copyleft");
  assertPasses("MIT AND (ISC OR GPL-2.0-only)");
  assertFails("GPL-3.0-only AND (MIT OR ISC)", "copyleft");
  assertPasses("(MIT OR GPL-3.0-only) AND (ISC OR AGPL-3.0)");
});

// Extends public "[boundary-4] a parenthesised choice ANDed with AGPL fails as copyleft": deeper nesting.
test("[boundary-4] nested parentheses are evaluated", () => {
  assertPasses("((GPL-3.0-only OR AGPL-3.0)) OR (ISC AND (MIT OR GPL-2.0-only))");
  assertFails("MIT AND (ISC AND (Apache-2.0 AND GPL-2.0-or-later))", "copyleft");
  assertFails("(MIT OR (GPL-2.0-only AND ISC)) AND (AGPL-3.0 OR GPL-3.0-only)", "copyleft");
});

// Extends public "[unhappy-2] UNLICENSED, SEE LICENSE IN, LicenseRef- and unparseable expressions fail as unknown".
test("[unhappy-2] other unparseable expressions fail as unknown", () => {
  for (const license of [
    "MIT OR",
    "OR MIT",
    "AND",
    "MIT AND AND ISC",
    "()",
    "MIT)",
    "(MIT",
    "MIT OR ()",
    "MIT WITH",
    "WITH Classpath-exception-2.0",
    "MIT, ISC",
    "(MIT OR ISC) Apache-2.0",
  ]) {
    assertFails(license, "unknown");
  }
});

// Extends public "[unhappy-2] UNLICENSED, SEE LICENSE IN, LicenseRef- and unparseable expressions fail as unknown":
// an expression that does not parse is unknown even when a GPL identifier appears in it.
test("[unhappy-2] an unparseable expression naming the GPL fails as unknown, not copyleft", () => {
  for (const license of [
    "GPL-3.0-only AND",
    "GPL-3.0-only ISC",
    "(GPL-3.0-only",
    "MIT OR GPL-3.0-only)",
    "AGPL-3.0 WITH",
    "MIT AND GPL-3.0-only OR",
  ]) {
    assertFails(license, "unknown");
  }
});

// Extends public "[unhappy-2] UNLICENSED, SEE LICENSE IN, LicenseRef- and unparseable expressions fail as unknown".
test("[unhappy-2] SEE LICENSE IN and LicenseRef- licences that mention the GPL fail as unknown", () => {
  for (const license of [
    "SEE LICENSE IN COPYING",
    "SEE LICENSE IN GPL-3.0.txt",
    "LicenseRef-GPL-Custom",
    "LicenseRef-scancode-agpl",
  ]) {
    assertFails(license, "unknown");
  }
});

// Extends public "[unhappy-2] an empty licence fails as unknown": a licence of only spaces.
test("[unhappy-2] a blank licence fails as unknown", () => {
  assertFailsAs({ license: "   " }, "unknown", "blank");
});

// Extends public "[unhappy-2] a package with no licence fails as unknown with a null licence":
// several such packages, nested and scoped.
test("[unhappy-2] every added package with no licence is listed as unknown with a null licence", () => {
  const submission = lockfile({
    "node_modules/zed": { version: "0.1.0" },
    "node_modules/zed/node_modules/@s/inner": { version: "0.2.0" },
    "node_modules/mid": { version: "1.0.0", license: "MIT" },
  });
  assert.deepEqual(scanLicences(BASE, submission), {
    passed: false,
    offenders: [
      { name: "@s/inner", version: "0.2.0", licence: null, reason: "unknown" },
      { name: "zed", version: "0.1.0", licence: null, reason: "unknown" },
    ],
  });
});

// Extends public "[unhappy-2] an old-style license object is read from its type field": a type that cannot be told.
test("[unhappy-2] an old-style license object whose type cannot be told fails as unknown", () => {
  assertFailsAs({ license: { url: "https://example.invalid/licence" } }, "unknown", "no type");
  assertFailsAs({ license: { type: "UNLICENSED" } }, "unknown", "UNLICENSED type");
  assertFailsAs({ license: { type: "MIT OR" } }, "unknown", "unparseable type");
});

// Extends public "[unhappy-2] an old-style license object is read from its type field": expressions in the type.
test("[unhappy-2] an old-style license object's type is read as an SPDX expression", () => {
  assert.deepEqual(scanOne({ license: { type: "MIT OR GPL-3.0-only" } }), { passed: true, offenders: [] });
  assertFailsAs({ license: { type: "AGPL-3.0" } }, "copyleft", "AGPL type");
  assertFailsAs({ license: { type: "GPL-2.0-only WITH Classpath-exception-2.0" } }, "copyleft", "GPL WITH type");
  assertFailsAs({ license: { type: "MIT AND GPL-3.0-only" } }, "copyleft", "AND type");
});

// Extends public "[unhappy-2] an old-style licenses array is read as each type joined by OR": one and three entries.
test("[unhappy-2] an old-style licenses array of one or three entries is read as their OR", () => {
  assert.deepEqual(scanOne({ licenses: [{ type: "MIT" }] }), { passed: true, offenders: [] });
  assertFailsAs({ licenses: [{ type: "GPL-2.0-only" }] }, "copyleft", "one GPL entry");
  assert.deepEqual(
    scanOne({ licenses: [{ type: "GPL-2.0-only" }, { type: "AGPL-3.0" }, { type: "ISC" }] }),
    { passed: true, offenders: [] },
  );
  assertFailsAs(
    { licenses: [{ type: "GPL-2.0-only" }, { type: "AGPL-3.0" }, { type: "GPL-3.0-only" }] },
    "copyleft",
    "three copyleft entries",
  );
});

// Extends public "[unhappy-2] an old-style licenses array is read as each type joined by OR": no entries at all.
test("[unhappy-2] an empty old-style licenses array fails as unknown", () => {
  assertFailsAs({ licenses: [] }, "unknown", "empty licenses");
});
