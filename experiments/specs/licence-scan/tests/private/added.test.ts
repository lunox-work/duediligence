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

// Extends public "[happy-1] a GPL package with the same name and version in both lockfiles is not scanned":
// the licence differs between the lockfiles, but the name and version pair is the same.
test("[happy-1] a pair the version had is not scanned even when the submission gives it another licence", () => {
  const version = lockfile({
    "node_modules/relicensed": { version: "1.0.0", license: "MIT" },
    "node_modules/now-unknown": { version: "2.0.0", license: "ISC" },
  });
  const submission = lockfile({
    "node_modules/relicensed": { version: "1.0.0", license: "GPL-3.0-only" },
    "node_modules/now-unknown": { version: "2.0.0" },
  });
  assert.deepEqual(scanLicences(version, submission), { passed: true, offenders: [] });
});

// Extends public "[happy-1] a package already in the version is not scanned even when its licence cannot be told":
// several unknown and copyleft packages, nested and scoped, all already in the version.
test("[happy-1] several copyleft and unknown packages the version already had are not scanned", () => {
  const entries = {
    "node_modules/a": { version: "1.0.0", license: "MIT" },
    "node_modules/a/node_modules/@s/gpl": { version: "3.1.4", license: "AGPL-3.0-only" },
    "node_modules/no-licence": { version: "0.0.1" },
    "node_modules/see-file": { version: "0.2.0", license: "SEE LICENSE IN LICENSE.md" },
    "node_modules/broken": { version: "0.3.0", license: "MIT AND" },
  };
  assert.deepEqual(scanLicences(lockfile(entries), lockfile(entries)), { passed: true, offenders: [] });
});

// Extends public "[happy-1] a GPL package with the same name and version in both lockfiles is not scanned":
// the version had the pair only as a development dependency.
test("[happy-1] a pair the version had as a development dependency is not scanned when the submission uses it in production", () => {
  const version = lockfile({ "node_modules/gpl-tool": { version: "1.0.0", license: "GPL-3.0-only", dev: true } });
  const submission = lockfile({ "node_modules/gpl-tool": { version: "1.0.0", license: "GPL-3.0-only" } });
  assert.deepEqual(scanLicences(version, submission), { passed: true, offenders: [] });
});

// Extends public "[happy-1] a GPL package with the same name and version in both lockfiles is not scanned":
// what only the version's lockfile holds is not scanned either.
test("[happy-1] packages only the version lockfile holds are not scanned", () => {
  const version = lockfile({
    "node_modules/base": { version: "1.0.0", license: "MIT" },
    "node_modules/removed-gpl": { version: "1.0.0", license: "GPL-3.0-only" },
    "node_modules/removed-unknown": { version: "1.0.0" },
  });
  const submission = lockfile({ "node_modules/base": { version: "1.0.0", license: "MIT" } });
  assert.deepEqual(scanLicences(version, submission), { passed: true, offenders: [] });
});

// Extends public "[happy-1] a GPL package with the same name and version in both lockfiles is not scanned":
// a hundred and fifty packages, half of them already in the version at other paths.
test("[happy-1] among many packages only those the version lacked are scanned", () => {
  const versionEntries: Record<string, Record<string, unknown>> = {};
  const submissionEntries: Record<string, Record<string, unknown>> = {};
  const expected: Offender[] = [];
  for (let i = 149; i >= 0; i--) {
    const name = `pkg-${pad(i)}`;
    const entry: Record<string, unknown> = { version: "1.0.0" };
    if (i % 3 === 0) entry.license = "GPL-3.0-only";
    if (i % 3 === 2) entry.license = "ISC";
    submissionEntries[`node_modules/${name}`] = entry;
    if (i % 2 === 0) {
      versionEntries[`node_modules/holder/node_modules/${name}`] = { ...entry };
    } else if (i % 3 === 0) {
      expected.unshift({ name, version: "1.0.0", licence: "GPL-3.0-only", reason: "copyleft" });
    } else if (i % 3 === 1) {
      expected.unshift({ name, version: "1.0.0", licence: null, reason: "unknown" });
    }
  }
  const result = scanLicences(lockfile(versionEntries), lockfile(submissionEntries));
  assert.deepEqual(result, { passed: false, offenders: expected });
});

// Extends public "[boundary-1] a new version of a dependency the version had is scanned":
// the submission keeps the old version beside the new one.
test("[boundary-1] only the new version is scanned when the submission keeps the old one too", () => {
  const version = lockfile({ "node_modules/left-pad": { version: "1.3.0", license: "GPL-3.0-only" } });
  const submission = lockfile({
    "node_modules/left-pad": { version: "1.3.0", license: "GPL-3.0-only" },
    "node_modules/a": { version: "1.0.0", license: "MIT" },
    "node_modules/a/node_modules/left-pad": { version: "2.0.0" },
  });
  assert.deepEqual(scanLicences(version, submission), {
    passed: false,
    offenders: [{ name: "left-pad", version: "2.0.0", licence: null, reason: "unknown" }],
  });
});

// Extends public "[boundary-1] a new version of a dependency the version had is scanned":
// the new version is scanned on its own licence, not the old one's.
test("[boundary-1] a new version with a permissive licence passes though the old one was GPL", () => {
  const version = lockfile({ "node_modules/left-pad": { version: "1.3.0", license: "GPL-3.0-only" } });
  const submission = lockfile({ "node_modules/left-pad": { version: "2.0.0", license: "MIT" } });
  assert.deepEqual(scanLicences(version, submission), { passed: true, offenders: [] });
});

// Extends public "[boundary-1] a new version of a dependency the version had is scanned":
// more than one new version of the same dependency.
test("[boundary-1] several new versions of one dependency are each scanned", () => {
  const version = lockfile({ "node_modules/lib": { version: "1.0.0", license: "GPL-2.0-only" } });
  const submission = lockfile({
    "node_modules/lib": { version: "2.0.0", license: "GPL-2.0-only" },
    "node_modules/x": { version: "1.0.0", license: "MIT" },
    "node_modules/x/node_modules/lib": { version: "3.0.0", license: "AGPL-3.0" },
    "node_modules/y": { version: "1.0.0", license: "MIT" },
    "node_modules/y/node_modules/lib": { version: "1.0.0", license: "GPL-2.0-only" },
  });
  assert.deepEqual(scanLicences(version, submission), {
    passed: false,
    offenders: [
      { name: "lib", version: "2.0.0", licence: "GPL-2.0-only", reason: "copyleft" },
      { name: "lib", version: "3.0.0", licence: "AGPL-3.0", reason: "copyleft" },
    ],
  });
});

// Extends public "[boundary-1] a new version of a dependency the version had is scanned":
// a prerelease of the same version number is a different version.
test("[boundary-1] a version that differs only by a prerelease tag counts as added", () => {
  const version = lockfile({ "node_modules/lib": { version: "1.0.0", license: "GPL-3.0-only" } });
  const submission = lockfile({ "node_modules/lib": { version: "1.0.0-beta.1", license: "GPL-3.0-only" } });
  assert.deepEqual(scanLicences(version, submission), {
    passed: false,
    offenders: [{ name: "lib", version: "1.0.0-beta.1", licence: "GPL-3.0-only", reason: "copyleft" }],
  });
});

// Extends public "[boundary-1] a name and version pair the version had under another path is not scanned again":
// scoped names, deeper nesting, and the pair at the top level in the version instead.
test("[boundary-1] a scoped pair the version had under any path is not scanned under other paths", () => {
  const version = lockfile({
    "node_modules/a": { version: "1.0.0", license: "MIT" },
    "node_modules/a/node_modules/@scope/gpl-lib": { version: "4.5.6", license: "AGPL-3.0" },
    "node_modules/unknown-lib": { version: "0.9.0" },
  });
  const submission = lockfile({
    "node_modules/@scope/gpl-lib": { version: "4.5.6", license: "AGPL-3.0" },
    "node_modules/b": { version: "1.0.0", license: "MIT" },
    "node_modules/b/node_modules/c": { version: "1.0.0", license: "MIT" },
    "node_modules/b/node_modules/c/node_modules/@scope/gpl-lib": { version: "4.5.6", license: "AGPL-3.0" },
    "node_modules/b/node_modules/unknown-lib": { version: "0.9.0" },
  });
  assert.deepEqual(scanLicences(version, submission), { passed: true, offenders: [] });
});

// Extends public "[boundary-2] an added development dependency is not scanned":
// nested and scoped dev entries, one with an unparseable licence.
test("[boundary-2] nested and scoped development dependencies are not scanned", () => {
  const submission = lockfile({
    "node_modules/tool": { version: "1.0.0", license: "MIT", dev: true },
    "node_modules/tool/node_modules/@s/gpl": { version: "2.0.0", license: "AGPL-3.0-only", dev: true },
    "node_modules/tool/node_modules/broken": { version: "1.0.0", license: "(MIT OR", dev: true },
    "node_modules/@t/unlicensed": { version: "1.0.0", license: "UNLICENSED", dev: true },
  });
  assert.deepEqual(scanLicences(BASE, submission), { passed: true, offenders: [] });
});

// Extends public "[boundary-2] an added entry with dev false is scanned":
// dev and production entries side by side, and entries with no "dev" field at all.
test("[boundary-2] development dependencies are skipped while the production ones beside them are listed", () => {
  const submission = lockfile({
    "node_modules/a-dev-gpl": { version: "1.0.0", license: "GPL-3.0-only", dev: true },
    "node_modules/b-prod-gpl": { version: "1.0.0", license: "GPL-3.0-only" },
    "node_modules/c-dev-unknown": { version: "1.0.0", dev: true },
    "node_modules/d-prod-unknown": { version: "1.0.0", dev: false },
    "node_modules/e-dev-agpl": { version: "1.0.0", license: "AGPL-3.0", dev: true },
  });
  assert.deepEqual(scanLicences(BASE, submission), {
    passed: false,
    offenders: [
      { name: "b-prod-gpl", version: "1.0.0", licence: "GPL-3.0-only", reason: "copyleft" },
      { name: "d-prod-unknown", version: "1.0.0", licence: null, reason: "unknown" },
    ],
  });
});

// Extends public "[boundary-2] an added entry with dev false is scanned":
// optional is not dev.
test("[boundary-2] an added optional dependency that is not dev is scanned", () => {
  const submission = lockfile({
    "node_modules/opt-gpl": { version: "1.0.0", license: "GPL-3.0-only", optional: true },
  });
  assert.deepEqual(scanLicences(BASE, submission), {
    passed: false,
    offenders: [{ name: "opt-gpl", version: "1.0.0", licence: "GPL-3.0-only", reason: "copyleft" }],
  });
});

// Extends public "[boundary-2] an added development dependency is not scanned":
// a dev entry does not hide a production entry of the same pair under another path.
test("[boundary-2] a pair added both as a dev entry and a production entry is listed once", () => {
  const submission = lockfile({
    "node_modules/gpl-lib": { version: "1.0.0", license: "GPL-3.0-only", dev: true },
    "node_modules/app-dep": { version: "1.0.0", license: "MIT" },
    "node_modules/app-dep/node_modules/gpl-lib": { version: "1.0.0", license: "GPL-3.0-only" },
  });
  assert.deepEqual(scanLicences(BASE, submission), {
    passed: false,
    offenders: [{ name: "gpl-lib", version: "1.0.0", licence: "GPL-3.0-only", reason: "copyleft" }],
  });
});
