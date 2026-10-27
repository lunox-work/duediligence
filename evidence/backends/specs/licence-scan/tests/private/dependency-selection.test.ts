import { test } from "node:test";
import assert from "node:assert/strict";
import { scanLicences } from "../../src/index.js";

function lock(packages: Record<string, unknown>): string {
  return JSON.stringify({ lockfileVersion: 3, packages });
}

// Extends public "existing name and version pairs are skipped regardless of licence".
test("[happy-1] existing pairs bypass even malformed licences and legacy fields", () => {
  const baseline = lock({
    "node_modules/tool": { version: "4.2.0", license: "MIT" },
    "node_modules/old/node_modules/tool": { version: "3.1.0", license: "ISC" },
    "node_modules/@s/other": { version: "6.0.0", license: "MIT" },
  });
  const submission = lock({
    "node_modules/tool": { version: "3.1.0", license: "MIT AND" },
    "node_modules/new/node_modules/tool": { version: "4.2.0", license: { type: "AGPLv7" } },
    "node_modules/@s/other": { version: "6.0.0", licenses: [{ type: "LicenseRef-private" }] },
  });
  assert.deepEqual(scanLicences(baseline, submission), { passed: true, offenders: [] });
});

// Extends public "a scoped dependency moved between nested paths is still existing".
test("[happy-1] deeply moved scoped and unscoped pairs use the last node_modules segment", () => {
  const baseline = lock({
    "node_modules/@outer/a/node_modules/b/node_modules/@inner/leaf": { version: "7.4.1" },
    "node_modules/a/node_modules/b/node_modules/leaf": { version: "2.3.4" },
  });
  const submission = lock({
    "node_modules/@inner/leaf": { version: "7.4.1", license: "AGPL-3.0" },
    "node_modules/x/node_modules/y/node_modules/@inner/leaf": { version: "7.4.1" },
    "node_modules/leaf": { version: "2.3.4", license: "GPL-2.0+" },
  });
  assert.deepEqual(scanLicences(baseline, submission), { passed: true, offenders: [] });
});

test("[happy-1] a baseline dev entry still establishes an existing name and version", () => {
  assert.deepEqual(scanLicences(lock({
    "node_modules/build/node_modules/shared": { version: "8.0.0", dev: true },
  }), lock({
    "node_modules/shared": { version: "8.0.0", dev: false, license: "GPL-3.0-only" },
  })), { passed: true, offenders: [] });
});

test("[happy-1] removing copyleft and unknown baseline packages introduces no offenders", () => {
  assert.deepEqual(scanLicences(lock({
    "node_modules/removed": { version: "1.0.0", license: "GPL-3.0-only" },
    "node_modules/parent/node_modules/@s/gone": { version: "2.0.0" },
  }), lock({
    "node_modules/new-permitted": { version: "3.0.0", license: "ISC" },
  })), { passed: true, offenders: [] });
});

// Extends public "a new version of an existing dependency is scanned".
test("[boundary-1] a downgrade and a prerelease are new pairs too", () => {
  const baseline = lock({ "node_modules/engine": { version: "9.0.0", license: "MIT" } });
  assert.deepEqual(scanLicences(baseline, lock({
    "node_modules/engine": { version: "8.9.9", license: "AGPL-3.0" },
    "node_modules/a/node_modules/engine": { version: "9.0.0-beta.2", license: "GPL-2.0+" },
  })), {
    passed: false,
    offenders: [
      { name: "engine", version: "8.9.9", licence: "AGPL-3.0", reason: "copyleft" },
      { name: "engine", version: "9.0.0-beta.2", licence: "GPL-2.0+", reason: "copyleft" },
    ],
  });
});

// Extends public "an existing pair at another path is skipped while a new version fails".
test("[boundary-1] every baseline version is remembered across multiple nested paths", () => {
  const baseline = lock({
    "node_modules/one/node_modules/tool": { version: "1.0.0" },
    "node_modules/two/node_modules/tool": { version: "2.0.0" },
    "node_modules/three/node_modules/tool": { version: "3.0.0" },
  });
  assert.deepEqual(scanLicences(baseline, lock({
    "node_modules/tool": { version: "3.0.0", license: "GPL-3.0-only" },
    "node_modules/a/node_modules/tool": { version: "1.0.0", license: "AGPL-3.0" },
    "node_modules/b/node_modules/tool": { version: "2.0.0" },
    "node_modules/c/node_modules/tool": { version: "4.0.0" },
  })), {
    passed: false,
    offenders: [{ name: "tool", version: "4.0.0", licence: null, reason: "unknown" }],
  });
});

test("[boundary-1] equal versions in other names or scopes do not establish an existing pair", () => {
  assert.deepEqual(scanLicences(lock({
    "node_modules/@a/item": { version: "5.0.0", license: "MIT" },
    "node_modules/item": { version: "6.0.0", license: "MIT" },
    "node_modules/other": { version: "7.0.0", license: "MIT" },
  }), lock({
    "node_modules/host/node_modules/@b/item": { version: "5.0.0", license: "GPLv3" },
    "node_modules/host/node_modules/item": { version: "7.0.0", license: "AGPL-3.0" },
  })), {
    passed: false,
    offenders: [
      { name: "@b/item", version: "5.0.0", licence: "GPLv3", reason: "copyleft" },
      { name: "item", version: "7.0.0", licence: "AGPL-3.0", reason: "copyleft" },
    ],
  });
});

// Extends public "a new version of an existing dependency is scanned" with
// permitted updates: being a changed version is not itself an offence.
test("[boundary-1] changed versions pass when their new licences are permitted", () => {
  assert.deepEqual(scanLicences(lock({
    "node_modules/tool": { version: "1.0.0", license: "GPLv3" },
    "node_modules/parent/node_modules/@s/tool": { version: "9.0.0" },
  }), lock({
    "node_modules/tool": { version: "2.0.0", license: "MIT" },
    "node_modules/@s/tool": { version: "8.0.0", license: "LGPL-3.0-only" },
  })), { passed: true, offenders: [] });
});

test("[boundary-1] differing build metadata does not make version strings an existing pair", () => {
  assert.deepEqual(scanLicences(lock({
    "node_modules/build": { version: "1.0.0+old", license: "MIT" },
  }), lock({
    "node_modules/build": { version: "1.0.0+new", license: "GPLv3" },
  })), {
    passed: false,
    offenders: [{ name: "build", version: "1.0.0+new", licence: "GPLv3", reason: "copyleft" }],
  });
});

// Extends public "added development dependencies are skipped even with failing licences".
test("[boundary-2] development entries skip parsing malformed and legacy licences", () => {
  assert.deepEqual(scanLicences(lock({}), lock({
    "node_modules/a": { version: "2.0.0", dev: true, license: "(GPL-3.0-only OR" },
    "node_modules/x/node_modules/@s/b": { version: "3.0.0", dev: true, license: { type: "UNLICENSED" } },
    "node_modules/c": { version: "4.0.0", dev: true, licenses: [{ type: "GPLv3" }] },
  })), { passed: true, offenders: [] });
});

// Extends public "false or omitted dev flags leave added dependencies subject to scanning".
test("[boundary-2] an earlier dev duplicate does not hide a later production occurrence", () => {
  for (const reversed of [false, true]) {
    const entries: [string, unknown][] = [
      ["node_modules/first/node_modules/shared", { version: "2.0.0", dev: true, license: "GPLv3" }],
      ["node_modules/second/node_modules/shared", { version: "2.0.0", dev: false, license: "GPLv3" }],
    ];
    if (reversed) entries.reverse();
    assert.deepEqual(scanLicences(lock({}), lock(Object.fromEntries(entries))), {
      passed: false,
      offenders: [{ name: "shared", version: "2.0.0", licence: "GPLv3", reason: "copyleft" }],
    });
  }
});

test("[boundary-2] a dev parent does not exempt a child whose own dev flag is absent", () => {
  assert.deepEqual(scanLicences(lock({}), lock({
    "node_modules/build": { version: "1.0.0", dev: true, license: "GPLv3" },
    "node_modules/build/node_modules/child": { version: "3.2.1", license: "AGPL-3.0" },
  })), {
    passed: false,
    offenders: [{ name: "child", version: "3.2.1", licence: "AGPL-3.0", reason: "copyleft" }],
  });
});

test("[boundary-2] dev filtering is per entry and does not exempt another version of its name", () => {
  assert.deepEqual(scanLicences(lock({}), lock({
    "node_modules/shared": { version: "1.0.0", dev: true },
    "node_modules/parent/node_modules/shared": { version: "2.0.0", dev: false },
    "node_modules/other/node_modules/shared": { version: "3.0.0", license: "MIT" },
  })), {
    passed: false,
    offenders: [{ name: "shared", version: "2.0.0", licence: null, reason: "unknown" }],
  });
});
