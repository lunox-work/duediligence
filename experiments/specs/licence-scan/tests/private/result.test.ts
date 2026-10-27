import { test } from "node:test";
import assert from "node:assert/strict";
import { scanLicences, type Offender } from "../../src/index.js";

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

/** Zero-pads an index so that names sort the same way by code unit and by locale. */
function pad(index: number): string {
  return String(index).padStart(3, "0");
}

// Extends public "[happy-3] the scan passes with no offenders when nothing added fails": many added packages.
test("[happy-3] the scan passes when a hundred added packages are all permitted", () => {
  const entries: Record<string, Record<string, unknown>> = {};
  const licences = ["MIT", "ISC", "Apache-2.0", "MIT OR GPL-3.0-only", "LGPL-3.0-only"];
  for (let i = 0; i < 100; i++) {
    entries[`node_modules/ok-${pad(i)}`] = { version: `1.${i}.0`, license: licences[i % licences.length] };
  }
  assert.deepEqual(scanLicences(BASE, lockfile(entries)), { passed: true, offenders: [] });
});

// Extends public "[happy-3] offenders are listed by name, then version": more offenders, inserted out of order.
test("[happy-3] many offenders are listed by name then version whatever their paths", () => {
  const submission = lockfile({
    "node_modules/zulu": { version: "1.0.0", license: "GPL-3.0-only" },
    "node_modules/zulu/node_modules/kilo": { version: "2.0.0" },
    "node_modules/alpha": { version: "1.0.0", license: "MIT" },
    "node_modules/alpha/node_modules/mike": { version: "1.2.0", license: "AGPL-3.0" },
    "node_modules/mike": { version: "1.0.0", license: "UNLICENSED" },
    "node_modules/bravo": { version: "1.0.0", license: "MIT" },
    "node_modules/bravo/node_modules/kilo": { version: "1.0.0", license: "GPL-2.0-only" },
    "node_modules/bravo/node_modules/mike": { version: "3.0.0", license: "GPL-3.0-or-later" },
    "node_modules/charlie": { version: "1.0.0", license: "LicenseRef-Proprietary" },
  });
  assert.deepEqual(scanLicences(BASE, submission), {
    passed: false,
    offenders: [
      { name: "charlie", version: "1.0.0", licence: "LicenseRef-Proprietary", reason: "unknown" },
      { name: "kilo", version: "1.0.0", licence: "GPL-2.0-only", reason: "copyleft" },
      { name: "kilo", version: "2.0.0", licence: null, reason: "unknown" },
      { name: "mike", version: "1.0.0", licence: "UNLICENSED", reason: "unknown" },
      { name: "mike", version: "1.2.0", licence: "AGPL-3.0", reason: "copyleft" },
      { name: "mike", version: "3.0.0", licence: "GPL-3.0-or-later", reason: "copyleft" },
      { name: "zulu", version: "1.0.0", licence: "GPL-3.0-only", reason: "copyleft" },
    ],
  });
});

// Extends public "[happy-3] offenders are listed by name, then version": reasons are interleaved, not grouped.
test("[happy-3] offenders are ordered by name, not grouped by reason", () => {
  const submission = lockfile({
    "node_modules/c-unknown": { version: "1.0.0", license: "SEE LICENSE IN LICENSE" },
    "node_modules/b-copyleft": { version: "1.0.0", license: "AGPL-3.0" },
    "node_modules/a-unknown": { version: "1.0.0" },
    "node_modules/d-copyleft": { version: "1.0.0", license: "GPL-2.0+" },
  });
  assert.deepEqual(scanLicences(BASE, submission), {
    passed: false,
    offenders: [
      { name: "a-unknown", version: "1.0.0", licence: null, reason: "unknown" },
      { name: "b-copyleft", version: "1.0.0", licence: "AGPL-3.0", reason: "copyleft" },
      { name: "c-unknown", version: "1.0.0", licence: "SEE LICENSE IN LICENSE", reason: "unknown" },
      { name: "d-copyleft", version: "1.0.0", licence: "GPL-2.0+", reason: "copyleft" },
    ],
  });
});

// Extends public "[happy-3] offenders are listed by name, then version": one name a prefix of another.
test("[happy-3] a name that is a prefix of another is listed first", () => {
  const submission = lockfile({
    "node_modules/libxyz": { version: "1.0.0", license: "GPL-3.0-only" },
    "node_modules/lib": { version: "1.0.0", license: "GPL-3.0-only" },
    "node_modules/libx": { version: "1.0.0", license: "GPL-3.0-only" },
  });
  assert.deepEqual(scanLicences(BASE, submission), {
    passed: false,
    offenders: [
      { name: "lib", version: "1.0.0", licence: "GPL-3.0-only", reason: "copyleft" },
      { name: "libx", version: "1.0.0", licence: "GPL-3.0-only", reason: "copyleft" },
      { name: "libxyz", version: "1.0.0", licence: "GPL-3.0-only", reason: "copyleft" },
    ],
  });
});

// Extends public "[happy-3] offenders are listed by name, then version": a hundred and fifty packages in reverse order.
test("[happy-3] a large submission lists exactly its failing packages in order", () => {
  const entries: Record<string, Record<string, unknown>> = {
    "node_modules/host": { version: "1.0.0", license: "MIT" },
    "node_modules/@group/host": { version: "1.0.0", license: "MIT" },
  };
  const expected: Offender[] = [];
  for (let i = 149; i >= 0; i--) {
    const name = `pkg-${pad(i)}`;
    const path =
      i % 3 === 0 ? `node_modules/${name}` : i % 3 === 1 ? `node_modules/host/node_modules/${name}` : `node_modules/@group/host/node_modules/${name}`;
    const entry: Record<string, unknown> = { version: "1.0.0" };
    if (i % 5 === 0) {
      entry.license = "GPL-3.0-only";
      expected.unshift({ name, version: "1.0.0", licence: "GPL-3.0-only", reason: "copyleft" });
    } else if (i % 5 === 1) {
      expected.unshift({ name, version: "1.0.0", licence: null, reason: "unknown" });
    } else if (i % 5 === 2) {
      entry.license = "MIT OR GPL-3.0-only";
    } else if (i % 5 === 3) {
      entry.license = "GPL-3.0-only";
      entry.dev = true;
    } else {
      entry.license = "Apache-2.0";
    }
    entries[path] = entry;
  }
  assert.deepEqual(scanLicences(BASE, lockfile(entries)), { passed: false, offenders: expected });
});

// Extends public "[happy-3] a name and version pair added under two paths is listed once": three paths, other versions kept.
test("[happy-3] a pair added under three paths is listed once while its other versions are listed too", () => {
  const submission = lockfile({
    "node_modules/dup": { version: "3.0.0", license: "GPL-3.0-only" },
    "node_modules/x": { version: "1.0.0", license: "MIT" },
    "node_modules/x/node_modules/dup": { version: "3.0.0", license: "GPL-3.0-only" },
    "node_modules/y": { version: "1.0.0", license: "MIT" },
    "node_modules/y/node_modules/dup": { version: "3.0.0", license: "GPL-3.0-only" },
    "node_modules/y/node_modules/z": { version: "1.0.0", license: "MIT" },
    "node_modules/y/node_modules/z/node_modules/dup": { version: "4.0.0" },
  });
  assert.deepEqual(scanLicences(BASE, submission), {
    passed: false,
    offenders: [
      { name: "dup", version: "3.0.0", licence: "GPL-3.0-only", reason: "copyleft" },
      { name: "dup", version: "4.0.0", licence: null, reason: "unknown" },
    ],
  });
});

// Extends public "[happy-3] the project entry under the empty path is never scanned":
// the project's own version differs between the lockfiles, so it is not an already-held pair.
test("[happy-3] the project entry is never scanned even when its version changed", () => {
  const submission = JSON.stringify({
    name: "app",
    version: "2.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": { name: "app", version: "2.0.0", license: "GPL-3.0-only" },
      "node_modules/base": { version: "1.0.0", license: "MIT" },
    },
  });
  assert.deepEqual(scanLicences(BASE, submission), { passed: true, offenders: [] });
});

// Extends public "[happy-3] the project entry under the empty path is never scanned":
// the version's lockfile has no project entry, and the submission adds an offender beside its own.
test("[happy-3] the project entry is never scanned when the version lockfile has none", () => {
  const version = JSON.stringify({ lockfileVersion: 3, packages: {} });
  const submission = JSON.stringify({
    name: "app",
    version: "1.0.0",
    lockfileVersion: 3,
    packages: {
      "": { name: "app", version: "1.0.0" },
      "node_modules/gpl": { version: "1.0.0", license: "AGPL-3.0-only" },
    },
  });
  assert.deepEqual(scanLicences(version, submission), {
    passed: false,
    offenders: [{ name: "gpl", version: "1.0.0", licence: "AGPL-3.0-only", reason: "copyleft" }],
  });
});

// Extends public "[happy-3] an offender's name is its path after the last node_modules/": deeper nesting.
test("[happy-3] a deeply nested offender is named by the last segment after node_modules/", () => {
  const submission = lockfile({
    "node_modules/a": { version: "1.0.0", license: "MIT" },
    "node_modules/a/node_modules/b": { version: "1.0.0", license: "MIT" },
    "node_modules/a/node_modules/b/node_modules/c": { version: "1.0.0", license: "GPL-3.0-only" },
    "node_modules/a/node_modules/@x/y": { version: "1.0.0", license: "MIT" },
    "node_modules/a/node_modules/@x/y/node_modules/@s/deep": { version: "2.0.0" },
  });
  assert.deepEqual(scanLicences(BASE, submission), {
    passed: false,
    offenders: [
      { name: "@s/deep", version: "2.0.0", licence: null, reason: "unknown" },
      { name: "c", version: "1.0.0", licence: "GPL-3.0-only", reason: "copyleft" },
    ],
  });
});

// Extends public "[happy-3] an offender's name is its path after the last node_modules/": an aliased entry.
test("[happy-3] an offender is named by its path, not by the entry's name field", () => {
  const submission = lockfile({
    "node_modules/alias": { name: "real-package", version: "1.0.0", license: "GPL-3.0-only" },
  });
  assert.deepEqual(scanLicences(BASE, submission), {
    passed: false,
    offenders: [{ name: "alias", version: "1.0.0", licence: "GPL-3.0-only", reason: "copyleft" }],
  });
});

// Extends public "[happy-3] an offender's name is its path after the last node_modules/":
// the version had an entry whose name field matches, but under another path name.
test("[happy-3] a pair is matched against the version by path name, not by the entry's name field", () => {
  const version = lockfile({ "node_modules/foo": { name: "foo", version: "1.0.0", license: "GPL-3.0-only" } });
  const submission = lockfile({ "node_modules/bar": { name: "foo", version: "1.0.0", license: "GPL-3.0-only" } });
  assert.deepEqual(scanLicences(version, submission), {
    passed: false,
    offenders: [{ name: "bar", version: "1.0.0", licence: "GPL-3.0-only", reason: "copyleft" }],
  });
});

// Extends public "[happy-3] an offender's name is its path after the last node_modules/":
// scoped packages that share their last segment are different names.
test("[happy-3] scoped packages sharing a last segment are different names", () => {
  const version = lockfile({ "node_modules/@a/util": { version: "1.0.0", license: "GPL-3.0-only" } });
  const submission = lockfile({
    "node_modules/@a/util": { version: "1.0.0", license: "GPL-3.0-only" },
    "node_modules/@b/util": { version: "1.0.0", license: "GPL-3.0-only" },
    "node_modules/util": { version: "1.0.0" },
  });
  assert.deepEqual(scanLicences(version, submission), {
    passed: false,
    offenders: [
      { name: "@b/util", version: "1.0.0", licence: "GPL-3.0-only", reason: "copyleft" },
      { name: "util", version: "1.0.0", licence: null, reason: "unknown" },
    ],
  });
});

// Extends public "[happy-3] offenders are listed by name, then version": the licence is reported exactly as written.
test("[happy-3] an offender's licence is the expression exactly as written", () => {
  const licence = "MIT AND (ISC OR GPL-2.0-only WITH Classpath-exception-2.0) AND agpl-3.0";
  const submission = lockfile({ "node_modules/mixed": { version: "1.0.0", license: licence } });
  assert.deepEqual(scanLicences(BASE, submission), {
    passed: false,
    offenders: [{ name: "mixed", version: "1.0.0", licence, reason: "copyleft" }],
  });
});
