#!/usr/bin/env node
// A suite on `go test`, mapped onto the result bin/runners/shared.mjs
// describes. Run in the module's folder:
//
//   node bin/runners/go-test.mjs '{"suite":"public","files":["tests/public/parse_test.go"]}'
//
// The files' folders are Go packages. Each is compiled once
// (`go test -c`); a package that does not compile crashes its files. Then
// every top-level test runs in its own process under `go tool test2json`,
// because a panic (the skeleton's `panic("not implemented")`) ends the test
// binary: one test's panic must fail that test, not hide the rest. A test's
// file is the one that declares `func TestX(t *testing.T)`; subtests are
// named `TestX/sub` as go names them, and a failing subtest fails its parent.
// A test named `Test_<kind>_<n>__...` is keyed to that spec scenario.
//
// Optional fields: `build` (a check run first; a failure crashes every
// file), `go` (default go), `testTimeoutMs` (per top-level test, default
// 20 s), `env` (added to the environment).

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { OUTPUT_CHARS, build, config, print } from "./shared.mjs";

const { suite, files, build: command = null, go = "go", testTimeoutMs = 20_000, env: extra = {} } = config(
  "node bin/runners/go-test.mjs '<json>'",
);
const root = realpathSync(process.cwd());
const scratch = mkdtempSync(join(realpathSync(tmpdir()), "independent-tests-go-"));
const env = { ...process.env, GOFLAGS: "-mod=mod", GOTOOLCHAIN: "local", GOCACHE: process.env.GOCACHE ?? join(scratch, "cache"), ...extra };
const run = (bin, argv, options = {}) =>
  spawnSync(bin, argv, { cwd: root, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024, ...options });

/** Top-level test functions a file declares. */
const declared = (file) =>
  [...readFileSync(join(root, file), "utf8").matchAll(/^func\s+(Test\w*)\s*\(\s*\w+\s+\*testing\.T\s*\)/gm)].map((match) => match[1]);

/** One top-level test in its own process: its leaf results, or null when it never reported. */
function runTest(binary, name) {
  const out = run(go, ["tool", "test2json", binary, "-test.v=test2json", "-test.count=1", `-test.run=^${name}$`], {
    timeout: testTimeoutMs + 10_000,
  });
  const events = (out.stdout ?? "")
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));
  const outputs = new Map();
  const finished = new Map();
  for (const event of events) {
    if (event.Test === undefined) continue;
    // The test's own output, without go's progress lines.
    if (event.Action === "output" && !/^(=== (RUN|PAUSE|CONT|NAME)|--- (PASS|FAIL|SKIP))/.test(event.Output.trimStart()))
      outputs.set(event.Test, `${outputs.get(event.Test) ?? ""}${event.Output}`);
    if (["pass", "fail", "skip"].includes(event.Action)) finished.set(event.Test, event.Action);
  }
  const timedOut = out.error?.code === "ETIMEDOUT";
  if (!finished.has(name))
    // Killed, or ended by a panic before go reported the test: it failed.
    return [{ name, ok: false, skipped: false, error: { failureType: timedOut ? "timeout" : "panic", code: null, message: (outputs.get(name) ?? out.stdout ?? "").slice(-OUTPUT_CHARS) } }];
  // Leaves: tests no other reported test is nested under.
  const names = [...finished.keys()];
  return names
    .filter((test) => !names.some((other) => other.startsWith(`${test}/`)))
    .map((test) => ({
      name: test,
      ok: finished.get(test) !== "fail",
      skipped: finished.get(test) === "skip",
      error: finished.get(test) === "fail" ? { failureType: "testCodeFailure", code: null, message: (outputs.get(test) ?? "").slice(-OUTPUT_CHARS) } : null,
    }));
}

/**
 * `[happy-1] Test_happy_1__inside` for a test named `Test_<kind>_<n>__...`
 * (subtests keep their parent's key): the spec scenario it asserts, which
 * is all a verdict reports of a failing hidden test.
 */
const keyed = (name) => {
  const match = /^Test_([a-z]+)_(\d+)__/.exec(name);
  return match === null ? name : `[${match[1]}-${match[2]}] ${name}`;
};

const built = build(command, root);
let compileOutput = built.compileOutput;
const results = new Map(files.map((file) => [file, { file, crashed: !built.compiled, timedOut: false, tests: [] }]));
try {
  if (built.compiled)
    for (const folder of [...new Set(files.map((file) => dirname(file)))].sort()) {
      const binary = join(scratch, `${folder.replace(/[^A-Za-z0-9]+/g, "_")}.test`);
      const compiled = run(go, ["test", "-c", "-o", binary, `./${folder}`]);
      const own = files.filter((file) => dirname(file) === folder);
      if (compiled.status !== 0) {
        compileOutput ||= `${compiled.stdout}${compiled.stderr}`.slice(0, OUTPUT_CHARS);
        for (const file of own) results.get(file).crashed = true;
        continue;
      }
      for (const file of own)
        for (const name of declared(file))
          results.get(file).tests.push(...runTest(binary, name).map((test) => ({ ...test, name: keyed(test.name) })));
    }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
const all = [...results.values()];
// Nothing compiled at all reads as not compiled, as a failed `tsc` does.
const compiled = built.compiled && !(all.length > 0 && all.every((file) => file.crashed));
print({ suite, compiled, compileOutput: compiled ? "" : compileOutput, files: all });
