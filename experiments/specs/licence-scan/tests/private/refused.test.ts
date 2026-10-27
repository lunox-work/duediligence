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

/** A readable submission that adds one GPL package. */
const GPL_SUBMISSION = lockfile({ "node_modules/gpl": { version: "1.0.0", license: "GPL-3.0-only" } });

/** Builds a lockfile text with the given top-level fields. */
function raw(fields: Record<string, unknown>): string {
  return JSON.stringify({ name: "app", version: "1.0.0", ...fields });
}

/**
 * Asserts that readable lockfiles give a result, and that the unreadable text is refused
 * with an error in either position.
 */
function assertRefused(unreadable: string, label: string): void {
  assert.deepEqual(
    scanLicences(BASE, GPL_SUBMISSION),
    { passed: false, offenders: [{ name: "gpl", version: "1.0.0", licence: "GPL-3.0-only", reason: "copyleft" }] },
    label,
  );
  assert.throws(() => scanLicences(BASE, unreadable), Error, `${label} as the submission`);
  assert.throws(() => scanLicences(unreadable, BASE), Error, `${label} as the version`);
  assert.throws(() => scanLicences(unreadable, GPL_SUBMISSION), Error, `${label} as the version beside a GPL submission`);
}

// Extends public "[unhappy-3] a lockfile that is not JSON is refused with an error": other texts that are not JSON.
test("[unhappy-3] empty, truncated or trailing-garbage texts are refused with an error", () => {
  assertRefused("", "empty text");
  assertRefused("{", "lone brace");
  assertRefused(BASE.slice(0, -1), "truncated lockfile");
  assertRefused(`${BASE} x`, "lockfile with trailing text");
  assertRefused("{'lockfileVersion': 3, 'packages': {}}", "single-quoted JSON-like text");
});

// Extends public "[unhappy-3] a lockfile with no packages object is refused with an error": JSON that is not an object.
test("[unhappy-3] JSON values that are not objects are refused with an error", () => {
  assertRefused("null", "null");
  assertRefused("[]", "array");
  assertRefused("3", "number");
  assertRefused('"package-lock"', "string");
});

// Extends public "[unhappy-3] a lockfile with no packages object is refused with an error": packages present but not an object.
test("[unhappy-3] a packages value that is not an object is refused with an error", () => {
  assertRefused(raw({ lockfileVersion: 3, packages: null }), "null packages");
  assertRefused(raw({ lockfileVersion: 3, packages: "node_modules/x" }), "string packages");
  assertRefused(raw({ lockfileVersion: 3, packages: 3 }), "number packages");
});

// Extends public "[unhappy-3] a lockfile with no packages object is refused with an error":
// a lockfile version 1 style with "dependencies" instead of "packages".
test("[unhappy-3] a lockfile with dependencies but no packages object is refused with an error", () => {
  assertRefused(
    raw({ lockfileVersion: 3, dependencies: { gpl: { version: "1.0.0" } } }),
    "dependencies without packages",
  );
});

// Extends public "[unhappy-3] a lockfile with a lockfileVersion other than 3 is refused with an error": other versions.
test("[unhappy-3] lockfile versions 1 and 4 are refused with an error", () => {
  const packages = { "": { name: "app", version: "1.0.0" }, "node_modules/base": { version: "1.0.0", license: "MIT" } };
  assertRefused(raw({ lockfileVersion: 1, packages }), "version 1");
  assertRefused(raw({ lockfileVersion: 4, packages }), "version 4");
});

// Extends public "[unhappy-3] a lockfile with a lockfileVersion other than 3 is refused with an error":
// a refused submission is refused rather than returning its offenders.
test("[unhappy-3] a version 2 submission adding GPL packages is refused rather than listed", () => {
  const v2 = raw({
    lockfileVersion: 2,
    packages: {
      "": { name: "app", version: "1.0.0" },
      "node_modules/gpl": { version: "1.0.0", license: "GPL-3.0-only" },
    },
  });
  assertRefused(v2, "version 2 with GPL");
});
