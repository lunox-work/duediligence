import { test } from "node:test";
import assert from "node:assert/strict";
import { scanLicences } from "../../src/index.js";

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

test("[happy-3] the scan passes with no offenders when nothing added fails", () => {
  const submission = lockfile({
    "node_modules/base": { version: "1.0.0", license: "MIT" },
    "node_modules/fine": { version: "2.0.0", license: "ISC" },
  });
  assert.deepEqual(scanLicences(BASE, submission), { passed: true, offenders: [] });
});

test("[happy-3] the project entry under the empty path is never scanned", () => {
  const submission = JSON.stringify({
    name: "app",
    version: "1.0.0",
    lockfileVersion: 3,
    packages: { "": { name: "app", version: "1.0.0", license: "GPL-3.0-only" } },
  });
  assert.deepEqual(scanLicences(BASE, submission), { passed: true, offenders: [] });
});

test("[happy-3] offenders are listed by name, then version", () => {
  const submission = lockfile({
    "node_modules/gamma": { version: "1.0.0" },
    "node_modules/beta": { version: "2.0.0", license: "AGPL-3.0" },
    "node_modules/alpha": { version: "1.0.0", license: "MIT" },
    "node_modules/alpha/node_modules/beta": { version: "1.0.0", license: "GPL-2.0-only" },
  });
  assert.deepEqual(scanLicences(BASE, submission), {
    passed: false,
    offenders: [
      { name: "beta", version: "1.0.0", licence: "GPL-2.0-only", reason: "copyleft" },
      { name: "beta", version: "2.0.0", licence: "AGPL-3.0", reason: "copyleft" },
      { name: "gamma", version: "1.0.0", licence: null, reason: "unknown" },
    ],
  });
});

test("[happy-3] a name and version pair added under two paths is listed once", () => {
  const submission = lockfile({
    "node_modules/x": { version: "1.0.0", license: "MIT" },
    "node_modules/y": { version: "1.0.0", license: "MIT" },
    "node_modules/x/node_modules/dup": { version: "3.0.0", license: "GPL-3.0-only" },
    "node_modules/y/node_modules/dup": { version: "3.0.0", license: "GPL-3.0-only" },
  });
  assert.deepEqual(scanLicences(BASE, submission), {
    passed: false,
    offenders: [{ name: "dup", version: "3.0.0", licence: "GPL-3.0-only", reason: "copyleft" }],
  });
});

test("[happy-3] an offender's name is its path after the last node_modules/", () => {
  const submission = lockfile({
    "node_modules/a": { version: "1.0.0", license: "MIT" },
    "node_modules/a/node_modules/@s/b": { version: "1.0.0", license: "GPL-3.0-only" },
  });
  assert.deepEqual(scanLicences(BASE, submission), {
    passed: false,
    offenders: [{ name: "@s/b", version: "1.0.0", licence: "GPL-3.0-only", reason: "copyleft" }],
  });
});

test("[unhappy-3] a lockfile that is not JSON is refused with an error", () => {
  assert.doesNotThrow(() => scanLicences(BASE, BASE));
  assert.throws(() => scanLicences(BASE, "{ not json"));
  assert.throws(() => scanLicences("not json at all", BASE));
});

test("[unhappy-3] a lockfile with no packages object is refused with an error", () => {
  const noPackages = JSON.stringify({ name: "app", version: "1.0.0", lockfileVersion: 3 });
  assert.doesNotThrow(() => scanLicences(BASE, BASE));
  assert.throws(() => scanLicences(BASE, noPackages));
  assert.throws(() => scanLicences(noPackages, BASE));
});

test("[unhappy-3] a lockfile with a lockfileVersion other than 3 is refused with an error", () => {
  const v2 = JSON.stringify({
    name: "app",
    version: "1.0.0",
    lockfileVersion: 2,
    packages: { "": { name: "app", version: "1.0.0" } },
  });
  assert.doesNotThrow(() => scanLicences(BASE, BASE));
  assert.throws(() => scanLicences(v2, BASE));
  assert.throws(() => scanLicences(BASE, v2));
});
