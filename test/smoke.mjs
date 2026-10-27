#!/usr/bin/env node
// The package end to end on the bundled spec, no model involved, on any OS
// (.github/workflows/test.yml runs it on macOS, Linux and Windows): judge
// the reference (passed) and the stub (incomplete), hand out a folder and
// run its `npm test` and sandbox/run.mjs, seal the spec and judge from the
// seal, and check what differs by OS in bin/platform.mjs and the session
// settings. Everything goes under a fresh temp folder.
//
//   node test/smoke.mjs

import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(ROOT, "bin", "cli.mjs");
const scratch = mkdtempSync(join(tmpdir(), "independent-tests-smoke-"));
const env = { ...process.env, INDEPENDENT_TESTS_HOME: join(scratch, "home"), INDEPENDENT_TESTS_WORK: join(scratch, "work") };
const reference = join(ROOT, "specs", "duration-parse", "reference", "src");
const stub = join(ROOT, "specs", "duration-parse", "skeleton", "src");

const cli = (...argv) => spawnSync(process.execPath, [CLI, ...argv], { env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const step = (name, fn) => {
  const started = Date.now();
  fn();
  console.log(`ok ${name} (${Math.round((Date.now() - started) / 100) / 10}s)`);
};
const show = (run) => `exit ${run.status}\n${run.stdout}${run.stderr}`.slice(-4000);

try {
  step("judge the reference: passed", () => {
    const run = cli("judge", "duration-parse", reference);
    assert.equal(run.status, 0, show(run));
    assert.match(run.stdout, /duration-parse: passed\. Public 22\/22, hidden 39\/39\./);
  });
  step("judge the stub: incomplete", () => {
    const run = cli("judge", "duration-parse", stub);
    assert.equal(run.status, 1, show(run));
    assert.match(run.stdout, /duration-parse: incomplete\./);
  });
  const handout = join(scratch, "handout");
  step("handout, npm test and sandbox/run.mjs", () => {
    const run = cli("handout", "duration-parse", handout);
    assert.equal(run.status, 0, show(run));
    cpSync(reference, join(handout, "src"), { recursive: true });
    const npm = spawnSync("npm test", { cwd: handout, encoding: "utf8", shell: true });
    assert.equal(npm.status, 0, show(npm));
    const suite = spawnSync(process.execPath, ["sandbox/run.mjs", "public"], { cwd: handout, encoding: "utf8" });
    assert.equal(suite.status, 0, show(suite));
    const result = JSON.parse(suite.stdout);
    assert.deepEqual(result.files.map((file) => file.file), ["tests/public/format.test.ts", "tests/public/parse.test.ts"]);
  });
  step("seal, and judge from the seal", () => {
    const seal = join(scratch, "duration-parse.seal.gz");
    const sealed = cli("seal", "duration-parse", "--out", seal);
    assert.equal(sealed.status, 0, show(sealed));
    const run = cli("judge", "--seal", seal, join(handout, "src"));
    assert.equal(run.status, 0, show(run));
    assert.match(run.stdout, /duration-parse: passed\./);
  });
  step("platform and session settings", () => {
    const script = `
      const platform = await import(${JSON.stringify(new URL("../bin/platform.mjs", import.meta.url).href)});
      const lib = await import(${JSON.stringify(new URL("../bin/lib.mjs", import.meta.url).href)});
      const settings = lib.sessionSettings(lib.WORK_ROOT);
      console.log(JSON.stringify({
        node: platform.which("node"),
        files: lib.listFiles(lib.BUNDLED_SPECS).filter((path) => path.startsWith("duration-parse/tests/")),
        failIfUnavailable: settings.sandbox.failIfUnavailable,
        rule: settings.permissions.deny.find((rule) => rule.startsWith("Read(")),
        python: lib.VENV_PYTHON,
      }));`;
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], { env, encoding: "utf8" });
    assert.equal(run.status, 0, show(run));
    const facts = JSON.parse(run.stdout);
    assert.ok(facts.node, "which(node) found nothing on PATH");
    assert.ok(facts.files.length > 0 && facts.files.every((path) => !path.includes("\\")), `listFiles: ${facts.files}`);
    const windows = process.platform === "win32";
    assert.equal(facts.failIfUnavailable, !windows);
    // Claude Code's rule form for an absolute path: //Users/me/** or, on Windows, //c/Users/me/**.
    assert.match(facts.rule, windows ? /^Read\(\/\/[a-z]\/[^\\:]+\/\*\*\)$/ : /^Read\(\/\/[^\\]+\/\*\*\)$/);
    assert.equal(facts.python, windows ? ".venv/Scripts/python.exe" : ".venv/bin/python");
  });
  console.log(`smoke passed on ${process.platform} ${process.version}`);
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
}
