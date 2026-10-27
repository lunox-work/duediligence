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

test("[happy-1] a GPL package with the same name and version in both lockfiles is not scanned", () => {
  const entries = { "node_modules/old-gpl": { version: "1.2.3", license: "GPL-3.0-only" } };
  const result = scanLicences(lockfile(entries), lockfile(entries));
  assert.deepEqual(result, { passed: true, offenders: [] });
});

test("[happy-1] a package already in the version is not scanned even when its licence cannot be told", () => {
  const entries = { "node_modules/no-licence": { version: "0.1.0" } };
  const result = scanLicences(lockfile(entries), lockfile(entries));
  assert.deepEqual(result, { passed: true, offenders: [] });
});

test("[boundary-1] a new version of a dependency the version had is scanned", () => {
  const version = lockfile({ "node_modules/left-pad": { version: "1.3.0", license: "GPL-3.0-only" } });
  const submission = lockfile({ "node_modules/left-pad": { version: "2.0.0", license: "GPL-3.0-only" } });
  const result = scanLicences(version, submission);
  assert.deepEqual(result, {
    passed: false,
    offenders: [{ name: "left-pad", version: "2.0.0", licence: "GPL-3.0-only", reason: "copyleft" }],
  });
});

test("[boundary-1] a name and version pair the version had under another path is not scanned again", () => {
  const version = lockfile({
    "node_modules/a": { version: "1.0.0", license: "MIT" },
    "node_modules/a/node_modules/left-pad": { version: "1.3.0", license: "GPL-3.0-only" },
  });
  const submission = lockfile({
    "node_modules/a": { version: "1.0.0", license: "MIT" },
    "node_modules/left-pad": { version: "1.3.0", license: "GPL-3.0-only" },
    "node_modules/b/node_modules/left-pad": { version: "1.3.0", license: "GPL-3.0-only" },
  });
  const result = scanLicences(version, submission);
  assert.deepEqual(result, { passed: true, offenders: [] });
});

test("[boundary-2] an added development dependency is not scanned", () => {
  const submission = lockfile({
    "node_modules/dev-gpl": { version: "1.0.0", license: "GPL-3.0-only", dev: true },
    "node_modules/dev-unknown": { version: "1.0.0", dev: true },
  });
  const result = scanLicences(BASE, submission);
  assert.deepEqual(result, { passed: true, offenders: [] });
});

test("[boundary-2] an added entry with dev false is scanned", () => {
  const submission = lockfile({
    "node_modules/prod-gpl": { version: "1.0.0", license: "GPL-3.0-only", dev: false },
  });
  const result = scanLicences(BASE, submission);
  assert.deepEqual(result, {
    passed: false,
    offenders: [{ name: "prod-gpl", version: "1.0.0", licence: "GPL-3.0-only", reason: "copyleft" }],
  });
});
