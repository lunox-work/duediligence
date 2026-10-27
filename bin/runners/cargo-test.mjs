#!/usr/bin/env node
// A suite on `cargo test`, mapped onto the result bin/runners/shared.mjs
// describes. Run in the crate's folder:
//
//   node bin/runners/cargo-test.mjs '{"suite":"public","files":["tests/public/main.rs","tests/public/parse.rs"]}'
//
// Each suite folder holding a main.rs is one integration-test target, which
// cargo names after the folder (`tests/public/main.rs` is `--test public`);
// its other files are its modules. The target is built once, its tests
// listed, and each run in its own process (`--exact`), so one that hangs
// fails alone; libtest's own line (`test parse::empty ... ok`) is the
// result, as stable Rust has no JSON test output. libtest catches a
// test's panic, so the skeleton's `unimplemented!()` fails that test. A
// test named `a::b::t` belongs to tests/<suite>/a.rs (or a/mod.rs) when that
// file was passed, otherwise to main.rs. A target that does not build
// crashes its files. A function named `<kind>_<n>__...` is keyed to that
// spec scenario.
//
// Optional fields: `build` (a check run first; a failure crashes every
// file), `cargo` (default cargo), `timeoutMs` (the build),
// `testTimeoutMs` (each test, default 20 s), `env`.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { OUTPUT_CHARS, build, config, print } from "./shared.mjs";

const { suite, files, build: command = null, cargo = "cargo", timeoutMs = 300_000, testTimeoutMs = 20_000, env: extra = {} } = config(
  "node bin/runners/cargo-test.mjs '<json>'",
);
const root = process.cwd();
const env = { ...process.env, CARGO_TERM_COLOR: "never", RUST_BACKTRACE: "0", ...extra };

/** libtest's report: each test's outcome and, for a failure, what it printed. */
function parse(stdout) {
  const outcomes = [...stdout.matchAll(/^test (\S+) \.\.\. (ok|FAILED|ignored)\b/gm)].map((match) => ({ name: match[1], outcome: match[2] }));
  const details = new Map();
  for (const match of stdout.matchAll(/^---- (\S+) stdout ----\n([\s\S]*?)(?=^---- \S+ stdout ----$|^failures:$|^test result:)/gm))
    details.set(match[1], match[2].trim());
  // `[happy-1] parse::happy_1__inside` for a function named `<kind>_<n>__...`.
  const keyed = (name) => {
    const match = /^([a-z]+)_(\d+)__/.exec(name.split("::").at(-1));
    return match === null ? name : `[${match[1]}-${match[2]}] ${name}`;
  };
  return outcomes.map(({ name, outcome }) => ({
    name: keyed(name),
    path: name,
    ok: outcome !== "FAILED",
    skipped: outcome === "ignored",
    error: outcome === "FAILED" ? { failureType: "testCodeFailure", code: null, message: (details.get(name) ?? "").slice(0, OUTPUT_CHARS) } : null,
  }));
}

const run = (bin, argv, timeout) =>
  spawnSync(bin, argv, { cwd: root, encoding: "utf8", env, timeout, maxBuffer: 64 * 1024 * 1024 });

/** The target's test binary, built once, or the build's output. */
function binaryOf(target) {
  const out = run(cargo, ["test", "--offline", "--no-run", "--test", target, "--message-format=json-render-diagnostics"], timeoutMs);
  const artifact = (out.stdout ?? "")
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line))
    .find((line) => line.reason === "compiler-artifact" && line.executable && line.target?.name === target);
  return artifact === undefined ? { output: `${out.error ?? ""}${out.stderr ?? ""}`.slice(-OUTPUT_CHARS) } : { binary: artifact.executable };
}

const built = build(command, root);
let compileOutput = built.compileOutput;
const results = new Map(files.map((file) => [file, { file, crashed: !built.compiled, timedOut: false, tests: [] }]));
if (built.compiled)
  for (const folder of [...new Set(files.filter((file) => file.endsWith("/main.rs")).map((file) => dirname(file)))].sort()) {
    const target = folder.split("/").at(-1);
    const own = files.filter((file) => file.startsWith(`${folder}/`));
    const { binary, output } = binaryOf(target);
    if (binary === undefined) {
      compileOutput ||= output;
      for (const file of own) results.get(file).crashed = true;
      continue;
    }
    // Each test in its own process, so one that hangs fails alone.
    const listed = (run(binary, ["--list", "--format=terse"], timeoutMs).stdout ?? "")
      .split("\n")
      .map((line) => /^(\S+): test$/.exec(line)?.[1])
      .filter(Boolean);
    for (const name of listed) {
      const out = run(binary, ["--exact", name, "--test-threads=1"], testTimeoutMs);
      const [reported] = parse(out.stdout ?? "");
      const test = reported ?? {
        ...parse(`test ${name} ... FAILED\n`)[0],
        error: { failureType: out.error?.code === "ETIMEDOUT" ? "timeout" : "crashed", code: null, message: `${out.error ?? ""}${out.stderr ?? ""}`.slice(-OUTPUT_CHARS) },
      };
      const { path, ...rest } = test;
      const module = path.includes("::") ? path.split("::")[0] : null;
      const file =
        [join(folder, `${module}.rs`), join(folder, module ?? "", "mod.rs")].find((candidate) => module !== null && own.includes(candidate)) ??
        join(folder, "main.rs");
      results.get(file)?.tests.push(rest);
    }
  }
const all = [...results.values()];
const compiled = built.compiled && !(all.length > 0 && all.every((file) => file.crashed));
print({ suite, compiled, compileOutput: compiled ? "" : compileOutput, files: all });
