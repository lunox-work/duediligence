import { test } from "node:test";
import assert from "node:assert/strict";
import { scanLicences } from "../../src/index.js";

function lock(packages: Record<string, unknown>): string {
  return JSON.stringify({ lockfileVersion: 3, packages });
}

test("[happy-1] existing name and version pairs are skipped regardless of licence", () => {
  const baseline = lock({
    "node_modules/gpl": { version: "1.0.0", license: "MIT" },
    "node_modules/agpl": { version: "2.0.0", license: "AGPL-3.0" },
    "node_modules/unknown": { version: "3.0.0" },
  });
  const submission = lock({
    "node_modules/gpl": { version: "1.0.0", license: "GPL-3.0-only" },
    "node_modules/agpl": { version: "2.0.0", license: "AGPL-3.0" },
    "node_modules/unknown": { version: "3.0.0" },
  });

  assert.deepEqual(scanLicences(baseline, submission), { passed: true, offenders: [] });
});

test("[happy-1] a scoped dependency moved between nested paths is still existing", () => {
  const baseline = lock({
    "node_modules/a/node_modules/@scope/name": { version: "1.0.0", license: "MIT" },
  });
  const submission = lock({
    "node_modules/@scope/name": { version: "1.0.0", license: "GPL-3.0-only" },
    "node_modules/b/node_modules/@scope/name": { version: "1.0.0" },
  });

  assert.deepEqual(scanLicences(baseline, submission), { passed: true, offenders: [] });
});

test("[boundary-1] a new version of an existing dependency is scanned", () => {
  const baseline = lock({
    "node_modules/left-pad": { version: "1.3.0", license: "MIT" },
  });
  const submission = lock({
    "node_modules/left-pad": { version: "2.0.0", license: "GPL-3.0-only" },
  });

  assert.deepEqual(scanLicences(baseline, submission), {
    passed: false,
    offenders: [
      { name: "left-pad", version: "2.0.0", licence: "GPL-3.0-only", reason: "copyleft" },
    ],
  });
});

test("[boundary-1] an existing pair at another path is skipped while a new version fails", () => {
  const baseline = lock({
    "node_modules/parent/node_modules/left-pad": { version: "1.3.0", license: "MIT" },
  });
  const submission = lock({
    "node_modules/left-pad": { version: "1.3.0", license: "GPL-3.0-only" },
    "node_modules/other/node_modules/left-pad": { version: "2.0.0" },
  });

  assert.deepEqual(scanLicences(baseline, submission), {
    passed: false,
    offenders: [{ name: "left-pad", version: "2.0.0", licence: null, reason: "unknown" }],
  });
});

test("[boundary-2] added development dependencies are skipped even with failing licences", () => {
  const submission = lock({
    "node_modules/gpl": { version: "1.0.0", license: "GPL-3.0-only", dev: true },
    "node_modules/a/node_modules/@scope/missing": { version: "1.0.0", dev: true },
  });

  assert.deepEqual(scanLicences(lock({}), submission), { passed: true, offenders: [] });
});

test("[boundary-2] false or omitted dev flags leave added dependencies subject to scanning", () => {
  const submission = lock({
    "node_modules/explicit": { version: "1.0.0", license: "AGPL-3.0", dev: false },
    "node_modules/implicit": { version: "1.0.0", license: "GPL-2.0+" },
  });

  assert.deepEqual(scanLicences(lock({}), submission), {
    passed: false,
    offenders: [
      { name: "explicit", version: "1.0.0", licence: "AGPL-3.0", reason: "copyleft" },
      { name: "implicit", version: "1.0.0", licence: "GPL-2.0+", reason: "copyleft" },
    ],
  });
});
