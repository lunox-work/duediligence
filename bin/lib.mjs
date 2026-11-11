// What the bin scripts share: where things live, how a blind `claude -p`
// session is started, how a tree is staged, hashed, tested and judged.
//
// Blindness is enforced, not trusted. Every session runs in a temp
// workdir under WORK_ROOT with:
// - the OS sandbox on for Bash: reads of the package, the person's data
//   (`PRIVATE`: HOME, SPECS, RUNS, RESULTS), WORK_ROOT and the session
//   transcripts under ~/.claude/projects are denied, except the session's
//   own workdir; no network; no unsandboxed fallback;
// - permission deny rules for the file tools, which the OS sandbox does not
//   cover: the same folders, the transcripts, and every other workdir that
//   exists when the session starts;
// - no CLAUDE.md, skills, plugins, hooks or MCP servers (`--safe-mode`,
//   `--strict-mcp-config`).
// Hidden tests at rest live only in SPECS, which is denied; a workdir that
// held them is deleted before any agent runs. `peeks` scans a transcript
// for any attempt anyway. That is the claude-cli backend; the others
// (`session`, bin/backends.mjs) run under an OS sandbox over the same
// workdir instead, and write the same transcript shape.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { freemem, homedir, tmpdir, totalmem } from "node:os";
import { basename, dirname, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PYTHON,
  GROUP,
  OS_SANDBOX,
  VENV_BIN_DIR,
  WINDOWS,
  comparable,
  inside,
  killTree,
  slash,
  spawnCommand,
  venvBin,
  which,
} from "./platform.mjs";
import { withBins } from "./runners/shared.mjs";
import { allowedIn, count, regressionsOf, scenarioOf, testsOf, verdict } from "./rules.mjs";

// The suite-result rules live in bin/rules.mjs (pure, shared with bin/api.mjs).
export { count, regressionsOf, scenarioOf, testsOf, verdict };

/**
 * The package: bin/, prompts/, template/ and the bundled example spec. It
 * may be an npx cache or a read-only global install, so nothing here writes
 * into it (a development checkout's template/node_modules aside).
 */
export const ROOT = realpathSync(join(dirname(fileURLToPath(import.meta.url)), ".."));
/** An env path, relative to the current folder, made real as far as it exists. */
const envPath = (value) => {
  const path = resolve(value);
  let at = path;
  while (!existsSync(at) && dirname(at) !== at) at = dirname(at);
  return join(realpathSync(at), relative(at, path));
};
/**
 * The person's data: DUEDILIGENCE_HOME, default ~/.duediligence/.
 * Under it: specs/<slug>/ (spec, suites, reference: the hidden suites at
 * rest), runs/ (transcripts, submissions, grades), results.jsonl, and
 * template/<lock hash>/ (the installed toolchain, `ensureTemplate`).
 * DUEDILIGENCE_SPECS and DUEDILIGENCE_RESULTS move those two
 * anywhere (evidence/in-repo.mjs points them into evidence/in-repo/).
 * A development checkout keeps everything in place with
 * DUEDILIGENCE_HOME=<checkout>. Every session's deny rules cover HOME,
 * SPECS, RUNS and RESULTS wherever they are (`PRIVATE`, `sessionSettings`).
 */
export const HOME = envPath(process.env.DUEDILIGENCE_HOME ?? join(homedir(), ".duediligence"));
export const SPECS = process.env.DUEDILIGENCE_SPECS ? envPath(process.env.DUEDILIGENCE_SPECS) : join(HOME, "specs");
export const PROMPTS = join(ROOT, "prompts");
export const RUNNERS = join(ROOT, "bin", "runners");
export const RUNS = join(HOME, "runs");
/** One line per graded run: HOME/results.jsonl, or DUEDILIGENCE_RESULTS. */
export const RESULTS = process.env.DUEDILIGENCE_RESULTS
  ? envPath(process.env.DUEDILIGENCE_RESULTS)
  : join(HOME, "results.jsonl");
export const TRANSCRIPTS = join(homedir(), ".claude", "projects");
/** The bundled specs (ROOT/specs/: duration-parse, the README's example). */
export const BUNDLED_SPECS = join(ROOT, "specs");

// realpathSync.native: on Windows it also expands 8.3 short names (RUNNER~1) in TEMP.
const realPath = WINDOWS ? realpathSync.native : realpathSync;
const workBase =
  process.env.DUEDILIGENCE_WORK ?? join(realPath(tmpdir()), "duediligence-work");
mkdirSync(workBase, { recursive: true });
export const WORK_ROOT = realPath(workBase);
/**
 * What no session may read: the package, the person's data and wherever
 * SPECS and RUNS were moved, folded so none is listed under another.
 * RESULTS is a file, denied on its own. WORK_ROOT may not overlap any of
 * them: a session's workdir under a denied folder could not read itself,
 * and a denied folder under WORK_ROOT would be in reach of the session that
 * owns it.
 */
export const PRIVATE = [...new Set([ROOT, HOME, SPECS, RUNS])]
  .filter((path, _, all) => !all.some((other) => other !== path && inside(path, other)))
  .sort();
for (const path of PRIVATE)
  if (inside(WORK_ROOT, path) || inside(path, WORK_ROOT))
    throw new Error(`DUEDILIGENCE_WORK (${WORK_ROOT}) and ${path} overlap; move one.`);

/**
 * A fresh home gets the bundled specs: the first script to run with the
 * default SPECS copies ROOT/specs/<slug>/ for each slug HOME/specs/ lacks,
 * so `confirm`, `prepare`, `handout` and `judge duration-parse` work on the
 * person's own copy and never write into the package. A slug removed from
 * HOME/specs/ stays removed: HOME/bundled.json lists what was copied once.
 */
if (process.env.DUEDILIGENCE_SPECS === undefined && SPECS !== BUNDLED_SPECS && existsSync(BUNDLED_SPECS)) {
  const record = join(HOME, "bundled.json");
  const copied = existsSync(record) ? JSON.parse(readFileSync(record, "utf8")) : [];
  const missing = readdirSync(BUNDLED_SPECS).filter(
    (slug) => existsSync(join(BUNDLED_SPECS, slug, "spec.md")) && !copied.includes(slug) && !existsSync(join(SPECS, slug)),
  );
  for (const slug of missing) {
    const partial = join(SPECS, `.${slug}.partial-${process.pid}`);
    mkdirSync(SPECS, { recursive: true });
    cpSync(join(BUNDLED_SPECS, slug), partial, { recursive: true });
    if (existsSync(join(SPECS, slug))) rmSync(partial, { recursive: true, force: true });
    else renameSync(partial, join(SPECS, slug));
  }
  if (missing.length > 0) writeFileSync(record, `${JSON.stringify([...new Set([...copied, ...missing])].sort())}\n`);
}

/**
 * The bundled toolchain, with its dependencies installed, which `stage`
 * copies into every new-module tree. A checkout that ran `npm ci` in
 * template/ uses it in place; otherwise it is HOME/template/<hash of its
 * lockfile>/, installed on first use by `ensureTemplate`, so a package
 * update with a new lockfile installs beside the old one.
 */
const TEMPLATE_SOURCE = join(ROOT, "template");
export const TEMPLATE = existsSync(join(TEMPLATE_SOURCE, "node_modules"))
  ? TEMPLATE_SOURCE
  : join(
      HOME,
      "template",
      createHash("sha256").update(readFileSync(join(TEMPLATE_SOURCE, "package-lock.json"))).digest("hex").slice(0, 12),
    );
/**
 * The environment for a nested `npx` install: without the npm_* variables
 * an outer `npx duediligence` sets (npm_config_package among them),
 * which would make the inner npx run its package spec as the command.
 */
export const installEnv = (extra = {}) => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^npm_/i.test(key))),
  ...extra,
});
/**
 * TEMPLATE, installing it first if it is missing: template/ copied without
 * node_modules, then the pinned npm's `ci` (network once; sessions never
 * install). Built in a partial folder and renamed, so two first uses at
 * once leave one whole install.
 */
export function ensureTemplate() {
  if (existsSync(join(TEMPLATE, "node_modules", "typescript"))) return TEMPLATE;
  const partial = `${TEMPLATE}.partial-${process.pid}`;
  rmSync(partial, { recursive: true, force: true });
  cpSync(TEMPLATE_SOURCE, partial, {
    recursive: true,
    filter: (from) => !relative(TEMPLATE_SOURCE, from).split(sep).includes("node_modules"),
  });
  log(`installing the toolchain into ${TEMPLATE} (npm@10.9.2 ci, once)`);
  const out = spawnCommand("npx", ["-y", "npm@10.9.2", "ci", "--no-audit", "--no-fund"], {
    cwd: partial,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: installEnv(),
  });
  if (out.status !== 0) {
    rmSync(partial, { recursive: true, force: true });
    throw new Error(`npm ci in the template failed:\n${`${out.error ?? ""}${out.stdout}${out.stderr}`.slice(-4000)}`);
  }
  if (existsSync(join(TEMPLATE, "node_modules", "typescript"))) rmSync(partial, { recursive: true, force: true });
  else {
    rmSync(TEMPLATE, { recursive: true, force: true });
    renameSync(partial, TEMPLATE);
  }
  return TEMPLATE;
}
/**
 * The interpreter the `python` toolchain and Python repositories run on:
 * DUEDILIGENCE_PYTHON, default `python3` on PATH (`python` on Windows).
 */
export const PYTHON = process.env.DUEDILIGENCE_PYTHON ?? DEFAULT_PYTHON;
const PYTHON_SOURCE = join(ROOT, "template-python");
/** The tree's own interpreter, which holds the pinned pytest: relative to a staged Python tree. */
export const VENV_PYTHON = venvBin("python");
const pythonTrees = new Map();
/**
 * A toolchain tree with what its suites need installed, which `stage`
 * copies into every new-module tree as it copies TEMPLATE: built once
 * under HOME/toolchains/<name>-<hash>/, the hash over the source folder
 * and the tool's version, so a changed harness or a new interpreter
 * installs beside the old one. `install(partial)` builds it in a partial
 * folder that is then renamed, so two first uses leave one whole tree.
 */
function toolchainTree(name, source, version, install) {
  const files = listFiles(source, [".venv", "target", "node_modules"]).filter(
    (path) => !path.split("/").includes("__pycache__"),
  );
  const hash = sha256(
    JSON.stringify([version, ...files.map((path) => [path, sha256(readFileSync(join(source, path)))])]),
  ).slice(0, 12);
  const dest = join(HOME, "toolchains", `${name}-${hash}`);
  const record = join(dest, ".installed.json");
  if (existsSync(record)) return dest;
  const partial = `${dest}.partial-${process.pid}`;
  rmSync(partial, { recursive: true, force: true });
  mkdirSync(dirname(partial), { recursive: true });
  for (const path of files) copy(join(source, path), join(partial, path));
  log(`installing the ${name} toolchain into ${dest} (once)`);
  try {
    install(partial);
  } catch (error) {
    rmSync(partial, { recursive: true, force: true });
    throw error;
  }
  writeJson(join(partial, ".installed.json"), { version, at: new Date().toISOString() });
  if (existsSync(record)) rmSync(partial, { recursive: true, force: true });
  else {
    rmSync(dest, { recursive: true, force: true });
    renameSync(partial, dest);
  }
  return dest;
}
/**
 * The `python` toolchain's tree: template-python/ with a .venv/ holding
 * the pytest requirements.txt pins, installed with pip's hash check, then
 * pip removed so the tree holds only what the suites run. Network once;
 * sessions never install. The venv's interpreter is a link to PYTHON's, so
 * a copy of the tree runs anywhere on the same machine.
 */
export function ensurePython() {
  if (pythonTrees.has(PYTHON)) return pythonTrees.get(PYTHON);
  const probe = spawnSync(PYTHON, ["-c", "import sys; print(sys.version); print(sys.executable)"], { encoding: "utf8" });
  if (probe.status !== 0) throw new Error(`No Python at ${PYTHON}: set DUEDILIGENCE_PYTHON to a python3.`);
  const dest = toolchainTree("python", PYTHON_SOURCE, probe.stdout.trim(), (partial) => {
    const step = (bin, argv) => {
      const out = spawnSync(bin, argv, { cwd: partial, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      if (out.status !== 0) throw new Error(`${bin} ${argv.join(" ")} failed:\n${`${out.error ?? ""}${out.stdout}${out.stderr}`.slice(-4000)}`);
    };
    step(PYTHON, ["-m", "venv", ".venv"]);
    const pip = ["-m", "pip", "--disable-pip-version-check", "--no-input", "-q"];
    step(VENV_PYTHON, [...pip, "install", "--no-deps", "--require-hashes", "-r", "requirements.txt"]);
    step(VENV_PYTHON, [...pip, "uninstall", "-y", "pip"]);
    // The activate scripts name the partial folder; nothing here sources them.
    for (const name of readdirSync(join(partial, ".venv", VENV_BIN_DIR)))
      if (/^(activate|pip)/i.test(name)) rmSync(join(partial, ".venv", VENV_BIN_DIR, name), { force: true });
  });
  pythonTrees.set(PYTHON, dest);
  return dest;
}
/**
 * The `go` and `rust` toolchains' trees: template-go/ and template-rust/
 * as they are (the standard library only, nothing to install), keyed by
 * the tool's version. `go` and `cargo` come from PATH.
 */
const versionOf = (bin, argv) => {
  const out = spawnSync(bin, argv, { encoding: "utf8" });
  if (out.status !== 0) throw new Error(`No ${bin} on PATH: the ${bin === "go" ? "go" : "rust"} toolchain needs it.`);
  return out.stdout.trim();
};
export const ensureGo = () => toolchainTree("go", join(ROOT, "template-go"), versionOf("go", ["version"]), () => {});
export const ensureRust = () => toolchainTree("rust", join(ROOT, "template-rust"), versionOf("cargo", ["--version"]), () => {});
/** Prepared base trees of repository targets: WORK_ROOT/targets/<slug>/<base sha>/, dependencies installed. */
export const TARGETS = join(WORK_ROOT, "targets");

/**
 * What differs between targets: the tree a session starts from, which
 * files are the skeleton and which are tests, what a build emits beside a
 * source (never a change), how a tree is checked and how a suite is run. A
 * spec picks one with specs/<slug>/toolchain.json (`{"name": "repo", ...}`);
 * without one it is `node`. Every suite runner prints the same shape
 * (bin/runners/shared.mjs), so everything above this layer (staging,
 * hashing, judging, grading) is shared.
 *
 * - `node`, the bundled template (template/): Node 22, TypeScript 5.9,
 *   `node:test`, ES modules, no network. One module, `src/index.ts`, is the
 *   interface both suites import; sessions run `sandbox/run.mjs <suite>`,
 *   the host runs the same suite through bin/runners/node-test.mjs.
 * - `python`, template-python/ with pytest in a .venv (`ensurePython`):
 *   `src/solution.py` (or `src/main.py`, an imported LiveCodeBench problem)
 *   is the interface; bin/runners/pytest.mjs runs each test file in its
 *   own process.
 * - `go` and `rust`, template-go/ and template-rust/, the standard library
 *   only, `go` and `cargo` from PATH: `src/task.go` and `src/lib.rs`;
 *   bin/runners/go-test.mjs and cargo-test.mjs run each test in its own
 *   process, so a panicking stub fails one test, not the binary.
 * - `repo`, a package inside an existing repository: its toolchain.json
 *   names the repository, the base commit, the package, the runner
 *   (`node-test`, `vitest`, `jest` or `pytest`, bin/runners/), the build,
 *   the test folders and the seam files the skeleton writes. Its tree is
 *   the prepared base under TARGETS, with the skeleton, the suites or a
 *   submission laid over it. A Python repository's base holds a .venv
 *   (`PYTHON_INSTALL`); its suites put `pythonPath` first on the path.
 *
 * `check` and `suite` return `[bin, argv, spawn options]`.
 */
export const TOOLCHAINS = {
  node: {
    name: "node",
    template: TEMPLATE,
    skeleton: ["src/index.ts"],
    isTest: (path) => path.endsWith(".test.ts"),
    testPattern: "*.test.ts",
    generated: (path, files) =>
      path.endsWith(".js") && files[path.replace(/\.js$/, ".ts")] !== undefined,
    marker: "sandbox/run.mjs",
    checkCommand: "npm run build",
    check: () => [process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json", "--noEmit"]],
    suite: (dir, suite) => [
      process.execPath,
      [
        join(RUNNERS, "node-test.mjs"),
        JSON.stringify({
          suite,
          files: listFiles(join(dir, "tests", suite))
            .filter((path) => /\.test\.tsx?$/.test(path))
            .map((path) => posix.join("tests", suite, path)),
          build: [process.execPath, "node_modules/typescript/bin/tsc", "-p", "tsconfig.json"],
          envFile: "sandbox.env",
          reporter: "./sandbox/reporter.mjs",
        }),
      ],
    ],
    reference: true,
  },
  python: {
    name: "python",
    template: null,
    ensure: () => ensurePython(),
    skeleton: ["src/solution.py", "src/main.py"],
    isTest: (path) => /(^|\/)test_[^/]*\.py$/.test(path),
    testPattern: "test_*.py",
    generated: (path) =>
      path.split("/").some((part) => part === "__pycache__" || part === ".pytest_cache") || path.endsWith(".pyc"),
    marker: "sandbox/run.py",
    checkCommand: `${DEFAULT_PYTHON} sandbox/compile_check.py`,
    check: (dir) => [join(dir, VENV_PYTHON), ["-I", "sandbox/compile_check.py"]],
    suite: (dir, suite) => {
      const files = listFiles(join(dir, "tests", suite))
        .filter((path) => /(^|\/)test_[^/]*\.py$/.test(path))
        .map((path) => posix.join("tests", suite, path));
      return [
        process.execPath,
        [
          join(RUNNERS, "pytest.mjs"),
          JSON.stringify({
            suite,
            files,
            python: VENV_PYTHON,
            build: [join(dir, VENV_PYTHON), "-I", "sandbox/compile_check.py"],
            timeouts: lcbTimeouts(dir, files),
          }),
        ],
      ];
    },
    reference: true,
  },
  go: {
    name: "go",
    template: null,
    ensure: () => ensureGo(),
    skeleton: ["src/task.go"],
    isTest: (path) => path.endsWith("_test.go"),
    testPattern: "*_test.go",
    generated: (path) => path.startsWith(".cache/"),
    marker: "go.mod",
    checkCommand: "go vet ./...",
    // Compiles every package and test, runs none.
    check: () => ["go", ["test", "-count=1", "-run", "^$", "./..."]],
    suite: (dir, suite) => [
      process.execPath,
      [
        join(RUNNERS, "go-test.mjs"),
        JSON.stringify({
          suite,
          files: listFiles(join(dir, "tests", suite))
            .filter((path) => path.endsWith("_test.go"))
            .map((path) => posix.join("tests", suite, path)),
        }),
      ],
    ],
    reference: true,
  },
  rust: {
    name: "rust",
    template: null,
    ensure: () => ensureRust(),
    skeleton: ["src/lib.rs"],
    isTest: (path) => /^tests\/[^/]+\/.*\.rs$/.test(path),
    testPattern: "*.rs",
    // No dependencies, so Cargo.lock pins nothing; cargo may write it.
    generated: (path) => path.startsWith("target/") || path === "Cargo.lock",
    marker: "Cargo.toml",
    checkCommand: "cargo test --offline --no-run",
    check: () => ["cargo", ["test", "--offline", "--no-run"]],
    suite: (dir, suite) => [
      process.execPath,
      [
        join(RUNNERS, "cargo-test.mjs"),
        JSON.stringify({
          suite,
          files: listFiles(join(dir, "tests", suite))
            .filter((path) => path.endsWith(".rs"))
            .map((path) => posix.join("tests", suite, path)),
        }),
      ],
    ],
    reference: true,
  },
  repo: {
    name: "repo",
    template: null,
    skeleton: [],
    isTest: (path) => /\.test\.tsx?$/.test(path),
    testPattern: "*.test.ts",
    generated: () => false,
    marker: null,
    check: (dir, chain) => {
      if (chain.build === undefined) return [process.execPath, ["-e", ""]];
      const cwd = join(dir, chain.package);
      return [chain.build, [], { cwd, env: withBins(cwd), shell: true, windowsHide: true }];
    },
    suite: (dir, suite, chain) => {
      const cwd = join(dir, chain.package);
      const files = suiteFiles(dir, suite, chain).map((path) => slash(relative(cwd, join(dir, path))));
      const { build, rootDir, outDir, testTimeoutMs } = chain;
      // pytest runs on the base tree's .venv, every file in one process, with
      // the package's import root first on the path, so the tree's own source
      // shadows the installed copy of the package.
      const python =
        chain.runner === "pytest"
          ? { python: slash(relative(cwd, join(dir, VENV_PYTHON))), pythonPath: chain.pythonPath, perFile: false }
          : {};
      return [
        process.execPath,
        [join(RUNNERS, `${chain.runner}.mjs`), JSON.stringify({ suite, files, build, rootDir, outDir, testTimeoutMs, ...python })],
        { cwd },
      ];
    },
    reference: true,
  },
  // A new module checked at a black-box seam: the node template, its suites
  // on node:test, but every test reaches the code through a command or an
  // HTTP service (`boundary` in toolchain.json, `execChain`), never an
  // import. The suite runs under bin/runners/boundary.mjs, which `stage`
  // copies into the tree as sandbox/boundary.mjs so sessions run the same.
  // The code may be Python, Go or Rust instead (`boundary.language`, `NATIVE`).
  exec: {
    name: "exec",
    template: TEMPLATE,
    skeleton: ["src/cli.ts"],
    isTest: (path) => path.endsWith(".test.ts"),
    testPattern: "*.test.ts",
    // A tree in another language (`NATIVE`) also builds .bin/ (Go) or
    // target/ (Rust), or leaves __pycache__ under src/.
    generated: (path, files) =>
      (path.endsWith(".js") && files[path.replace(/\.js$/, ".ts")] !== undefined) ||
      Object.values(NATIVE).some((native) => native.generated(path)),
    marker: "sandbox/boundary.json",
    checkCommand: "npm run build",
    check: (dir) =>
      nativeIn(dir) === null
        ? [process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json", "--noEmit"]]
        : [process.execPath, ["sandbox/build.mjs", "--check"]],
    suite: (dir, suite) => {
      const [bin, argv] = TOOLCHAINS.node.suite(dir, suite);
      // In another language the suites' build is sandbox/build.mjs: the TypeScript suites, then src/.
      if (nativeIn(dir) !== null) argv[1] = JSON.stringify({ ...JSON.parse(argv[1]), build: [process.execPath, "sandbox/build.mjs"] });
      return [process.execPath, [join(RUNNERS, "boundary.mjs"), join(dir, "sandbox", "boundary.json"), "--", bin, ...argv]];
    },
    reference: true,
  },
};
/**
 * A command or service written in another language than its suites:
 * toolchain.json `boundary.language`. The suites stay TypeScript on
 * node:test and reach the code only through the boundary, so nothing
 * above the tree differs; the tree is the node template plus `files`, the
 * skeleton is `entry` (a stub that exits 2, or a server answering 501),
 * and bin/runners/native-build.mjs, staged as sandbox/build.mjs, builds
 * the suites and then src/ for `npm run build`, the judge and a service's
 * start alike. The briefs are prompts/exec-native/ and prompts/http-native/,
 * rendered with `brief` and the boundary's own command. What the boundary
 * runs is the spec's to state in toolchain.json, where the commitment hash
 * covers it: `["python3", "src/cli.py"]`, `[".bin/task"]` (Go) or
 * `["target/debug/task"]` (Rust), as a command or as a service's start.
 */
export const NATIVE = {
  python: {
    entry: { command: "src/cli.py", service: "src/server.py" },
    files: {},
    generated: (path) => path.split("/").includes("__pycache__") || path.endsWith(".pyc"),
    brief: {
      language: "Python 3",
      stdlib: "Python's standard library only",
      stub: "writes `not implemented` and a newline on stderr and exits with code 2 (`sys.exit(2)`)",
      server: "an `http.server.ThreadingHTTPServer`",
      extra: "",
    },
  },
  go: {
    entry: { command: "src/main.go", service: "src/main.go" },
    files: { "go.mod": "module task\n\ngo 1.22\n" },
    generated: (path) => path.startsWith(".bin/"),
    brief: {
      language: "Go",
      stdlib: "Go's standard library only",
      stub: "writes `not implemented` and a newline on stderr and exits with code 2 (`os.Exit(2)`)",
      server: "`net/http`",
      extra: " `src/` is `package main` (module `task`); other files there are part of it.",
    },
  },
  rust: {
    entry: { command: "src/main.rs", service: "src/main.rs" },
    files: {
      "Cargo.toml": '[package]\nname = "task"\nversion = "0.1.0"\nedition = "2021"\npublish = false\n\n[[bin]]\nname = "task"\npath = "src/main.rs"\n\n[dependencies]\n',
    },
    generated: (path) => path.startsWith("target/") || path === "Cargo.lock",
    brief: {
      language: "Rust",
      stdlib: "the Rust standard library only (no crates)",
      stub: "writes `not implemented` and a newline on stderr and exits with code 2 (`std::process::exit(2)`)",
      server: "a `std::net::TcpListener` speaking HTTP/1.1 itself",
      extra: " `src/main.rs` is the crate root of the binary `task`; other files under `src/` are its modules.",
    },
  },
};
/** The language of an exec tree in another language than TypeScript, from its sandbox/boundary.json, or null. */
const nativeIn = (dir) => readJson(join(dir, "sandbox", "boundary.json"), {}).language ?? null;
/**
 * A black-box seam (toolchain.json `boundary`): exactly one of
 * `command` (argv, relative to the tree or package; the suites spawn it
 * per call, reading BOUNDARY_COMMAND) or `service` ({ start, healthcheck,
 * readyTimeoutMs }; started once per suite on PORT, the suites fetch
 * BOUNDARY_URL), plus `build` (run before a service starts). It is part of
 * what the hidden suite runs against, so the commitment hash covers it
 * (bin/commitment.mjs) and a seal carries it. Null when there is none.
 */
export function boundaryOf(config, slug) {
  const boundary = config.boundary;
  if (boundary === undefined) return null;
  const kinds = ["command", "service"].filter((kind) => boundary[kind] !== undefined);
  if (kinds.length !== 1) throw new Error(`${slug}: toolchain.json boundary names ${kinds.length === 0 ? "neither" : "both"} a command and a service`);
  if (boundary.service !== undefined && boundary.service.start === undefined) throw new Error(`${slug}: toolchain.json boundary.service has no start`);
  if (boundary.language !== undefined && !Object.hasOwn(NATIVE, boundary.language))
    throw new Error(`${slug}: toolchain.json boundary.language is ${JSON.stringify(boundary.language)}; one of ${Object.keys(NATIVE).join(", ")}`);
  return boundary;
}
/** What boundary.mjs reads for a tree of `chain`: its boundary, a service built first (in its language, if not TypeScript). */
const boundaryConfig = (chain) =>
  chain.name === "exec" && chain.boundary.service !== undefined
    ? {
        build:
          chain.boundary.language === undefined
            ? [process.execPath, "node_modules/typescript/bin/tsc", "-p", "tsconfig.json"]
            : [process.execPath, "sandbox/build.mjs"],
        ...chain.boundary,
      }
    : chain.boundary;
/**
 * The `exec` toolchain for a toolchain.json: the skeleton is the entry the
 * boundary runs (`src/cli.ts`, which exits 2, or `src/server.ts`, which
 * answers 501), the prompts prompts/exec/ or prompts/http/.
 */
export function execChain(config, slug) {
  const boundary = boundaryOf(config, slug);
  if (boundary === null) throw new Error(`${slug}: an exec toolchain.json needs a boundary (command or service)`);
  const service = boundary.service !== undefined;
  const native = boundary.language === undefined ? null : NATIVE[boundary.language];
  return {
    ...TOOLCHAINS.exec,
    skeleton: native !== null ? [native.entry[service ? "service" : "command"]] : service ? ["src/server.ts"] : ["src/cli.ts"],
    prompts: `${service ? "http" : "exec"}${native === null ? "" : "-native"}`,
    ...config,
    boundary,
    name: "exec",
    slug,
  };
}
/**
 * A LiveCodeBench test file's time on the Python template: the benchmark's
 * (6 + 1) seconds per case in the cases.json beside it, plus 5, plus slack,
 * as template-python/sandbox/run.py allows it.
 */
function lcbTimeouts(dir, files) {
  const out = {};
  for (const file of files) {
    const cases = readJson(join(dir, dirname(file), "cases.json"), null)?.cases;
    if (Array.isArray(cases)) out[file] = ((6 + 1) * cases.length + 5 + 30) * 1000;
  }
  return out;
}
/** A spec's toolchain, with its toolchain.json fields applied. */
export function toolchainOf(slug) {
  const config = readJson(join(SPECS, slug, "toolchain.json"), {});
  const base = TOOLCHAINS[config.name ?? "node"];
  if (base === undefined) throw new Error(`${slug}: no toolchain ${config.name}`);
  if (base.name === "repo") return repoChain(config, slug);
  if (base.name === "exec") return execChain(config, slug);
  return { ...base, ...config, name: base.name, slug };
}
/**
 * The `repo` toolchain for a toolchain.json's fields. `slug` is null for a
 * repository no spec targets yet (bin/fit.mjs), whose trees have no public
 * or hidden suite.
 */
export function repoChain(config, slug) {
  const required = ["repo", "base", "package", "runner", "testDir", ...(slug === null ? [] : ["hiddenDir", "seam"])];
  for (const field of required)
    if (config[field] === undefined) throw new Error(`${slug ?? config.repo}: toolchain.json has no ${field}`);
  if (!existsSync(join(RUNNERS, `${config.runner}.mjs`)))
    throw new Error(`${slug ?? config.repo}: no runner ${config.runner} (bin/runners/)`);
  // A relative `repo` is relative to this folder, so a spec can ship with the repository beside it.
  const chain = { ...TOOLCHAINS.repo, ...config, repo: resolve(ROOT, config.repo), name: "repo", slug };
  chain.template = slug === null ? baseTree(config) : join(TARGETS, slug, config.base);
  chain.skeleton = config.seam ?? [];
  chain.publicDir = config.publicDir ?? config.testDir;
  const matches = patternOf(chain.testPattern);
  chain.isTest = (path) => matches.test(path.split("/").at(-1));
  Object.assign(chain, namingOf(chain));
  const python = chain.runner === "pytest";
  if (python) {
    chain.prompts ??= "repo-python";
    chain.pythonPath ??= ["."];
  }
  // A build's output, where the repository's .gitignore does not hide it.
  const outDir = chain.outDir === undefined ? null : `${posix.join(chain.package, chain.outDir)}/`;
  chain.generated = (path) =>
    (outDir !== null && path.startsWith(outDir)) ||
    (python && (path.split("/").some((part) => part === "__pycache__" || part === ".pytest_cache") || path.endsWith(".pyc")));
  chain.boundary = boundaryOf(config, slug ?? config.repo);
  if (chain.boundary !== null) {
    // The runner, inside bin/runners/boundary.mjs: the service is up for the suite and down after it.
    const inner = chain.suite;
    chain.suite = (dir, suite, self) => {
      const [bin, argv, options] = inner(dir, suite, self);
      return [process.execPath, [join(RUNNERS, "boundary.mjs"), JSON.stringify(chain.boundary), "--", bin, ...argv], options];
    };
  }
  chain.test ??= commandOf(chain, "existing");
  return chain;
}
/**
 * What a repository spec's test files are called, by runner: the public
 * suite directly in publicDir, the implementer's own tests beside it.
 * TypeScript runners: `<slug>.test.ts` or `<slug>.<part>.test.ts`, own
 * `<slug>-own.test.ts` (the extension testPattern takes first). pytest:
 * one `test_<slug>.py` (the slug with `_` for anything not a letter or
 * digit), own `test_own_<slug>.py`, which the public name never matches.
 */
export function namingOf(chain) {
  if (chain.slug === null) return {};
  if (chain.runner === "pytest") {
    const stem = chain.slug.replace(/[^A-Za-z0-9]+/g, "_");
    return {
      publicName: `test_${stem}.py`,
      isPublicName: (name) => name === `test_${stem}.py`,
      ownName: `test_own_${stem}.py`,
    };
  }
  const ext = chain.testPattern.replace(/^\*\./, "").replace(/\{([^,}]*)[^}]*\}/, "$1");
  return {
    publicName: `${chain.slug}.*`,
    isPublicName: (name) => name.startsWith(`${chain.slug}.`),
    ownName: `${chain.slug}-own.${ext}`,
  };
}
/**
 * The command a session runs from the tree's root for one suite of a
 * repository target, with the repository's own tools: sessions cannot read
 * bin/runners/. `existing` runs the package's whole suite.
 */
export function commandOf(chain, suite) {
  if (chain.boundary) {
    // Sessions run the suite under the tree's copy of boundary.mjs (`stage` writes it into .git/).
    const plain = commandOf({ ...chain, boundary: null }, suite);
    const cd = /^cd [^&]+ && /.exec(plain)?.[0] ?? "";
    const up = chain.package === "." ? "" : `${posix.relative(chain.package, ".")}/`;
    return `${cd}node ${up}.git/duediligence/boundary.mjs -- sh -c '${plain.slice(cd.length).replace(/'/g, "'\\''")}'`;
  }
  const inPackage = (path) => posix.relative(chain.package, path) || ".";
  const folder = { public: chain.publicDir, own: chain.publicDir, private: chain.hiddenDir, existing: chain.testDir }[suite];
  const build = chain.build === undefined ? "" : `npx ${chain.build} && `;
  // From the tree's root: nothing to change into for a package at the root.
  const cd = chain.package === "." ? "" : `cd ${chain.package} && `;
  if (chain.runner === "pytest") {
    const target = {
      public: `${inPackage(folder)}/${chain.publicName}`,
      own: `${inPackage(folder)}/${chain.ownName}`,
      private: `${inPackage(folder)}/`,
      existing: inPackage(folder),
    }[suite];
    const python = posix.relative(chain.package, VENV_PYTHON) || VENV_PYTHON;
    // Windows' Python splits PYTHONPATH on ";", quoted for Git Bash, which sessions run there.
    const pythonPath = WINDOWS ? `'${chain.pythonPath.join(";")}'` : chain.pythonPath.join(":");
    return `${cd}PYTHONPATH=${pythonPath} ${python} -m pytest -p no:cacheprovider ${target}`;
  }
  if (chain.runner === "jest") {
    // Jest takes regular expressions over test paths.
    const filter = {
      public: `${inPackage(folder)}/${chain.slug}\\.`,
      own: `${inPackage(folder)}/${chain.slug}-own\\.`,
      private: `${inPackage(folder)}/`,
      existing: "",
    }[suite];
    return `${cd}npx jest ${filter === "" ? "" : `'${filter}'`}`.trimEnd();
  }
  if (chain.runner === "vitest") {
    const filter = {
      public: `${inPackage(folder)}/${chain.slug}.`,
      own: `${inPackage(folder)}/${chain.slug}-own.`,
      private: `${inPackage(folder)}/`,
      existing: "",
    }[suite];
    return `${cd}npx vitest run ${filter}`.trimEnd();
  }
  const compiled = posix.join(chain.outDir ?? ".", posix.relative(chain.rootDir ?? ".", inPackage(folder)));
  // The files listed by the session's shell, not globbed by node --test, which Node 20 cannot do.
  const files = { public: `${compiled}/${chain.slug}.*.js`, own: `${compiled}/${chain.slug}-own.*.js` }[suite] ?? `$(find ${compiled} -name '*.test.js')`;
  return `${cd}${build}node --test ${files}`;
}
/** The command a writer is told checks its tree: the toolchain's own, or a repository's build. */
export const checkCommand = (chain) =>
  chain.name !== "repo"
    ? chain.checkCommand
    : `${chain.package === "." ? "" : `cd ${chain.package} && `}npx ${chain.build ?? "true"}`;
/** The toolchain a staged tree was built from, by its runner; a repository tree has none, so its callers pass toolchainOf(slug). */
const toolchainIn = (dir) =>
  [TOOLCHAINS.exec, ...Object.values(TOOLCHAINS)].find((chain) => chain.marker !== null && existsSync(join(dir, chain.marker))) ??
  TOOLCHAINS.node;
/** Any of the toolchain's skeleton files, under `dir` (a staged tree or a spec's skeleton/). */
export const skeletonFile = (slug, dir) =>
  toolchainOf(slug).skeleton.find((path) => existsSync(join(dir, path))) ?? null;

/** `*` and `{a,b}` in a file-name pattern, as a RegExp over a base name. */
const patternOf = (glob) =>
  new RegExp(
    `^${glob
      .replace(/[.+^$()|[\]\\]/g, "\\$&")
      .replace(/\*/g, "[^/]*")
      .replace(/\{([^}]*)\}/g, (_, alts) => `(?:${alts.split(",").join("|")})`)}$`,
  );
/**
 * A repository suite's test files, relative to the tree: `public` is this
 * spec's files in publicDir (`<slug>.*`), `private` everything in
 * hiddenDir, `existing` every other test file under testDir.
 */
function suiteFiles(dir, suite, chain) {
  const matches = patternOf(chain.testPattern);
  const under = (folder) =>
    listFiles(join(dir, folder))
      .filter((path) => matches.test(path.split("/").at(-1)))
      .map((path) => posix.join(folder, path));
  // Directly in publicDir: a hidden file named after the spec is not public.
  const ownPublic = (path) =>
    chain.slug !== null && posix.dirname(path) === chain.publicDir && chain.isPublicName(path.split("/").at(-1));
  const hidden = (path) => chain.hiddenDir !== undefined && path.startsWith(`${chain.hiddenDir}/`);
  if (suite === "public") return under(chain.publicDir).filter(ownPublic);
  if (suite === "private") return under(chain.hiddenDir);
  if (suite === "existing") return under(chain.testDir).filter((path) => !ownPublic(path) && !hidden(path));
  throw new Error(`No suite ${suite}`);
}

/** The bundled template's skeleton file and test files, which the scripts that predate `repo` use. */
export const SKELETON = TOOLCHAINS.node.skeleton[0];
export const isTest = TOOLCHAINS.node.isTest;
/** What a toolchain emits beside a source file, which is never a change. */
export const emitted = (path, files) =>
  Object.values(TOOLCHAINS).some((chain) => chain.generated(path, files));
/** The implementing agent: its brief, and the one folder it may write besides src/. */
export const AGENT = { prompt: "agent", own: "tests/own/" };
/**
 * Where `judge` stages the hidden suite: under WORK_ROOT, which the OS
 * sandbox denies to Bash, and named in every session's file-tool deny rules
 * from the start, so a tree staged while an agent is still running is out
 * of its reach too (a sibling workdir is denied only when it exists when
 * the session starts).
 */
export const JUDGE_ROOT = join(WORK_ROOT, "judge");
mkdirSync(JUDGE_ROOT, { recursive: true });

/** Minutes a session may run before it is killed, and what it may spend. */
export const SESSION_MINUTES = { generate: 15, reference: 20, agent: 20 };
export const SESSION_BUDGET_USD = { generate: 5, reference: 8, agent: 10 };
/**
 * A repository session reads a codebase before it writes, so it starts
 * with more of both; toolchain.json `sessionMinutes` and `sessionBudgetUsd`
 * override them per kind. generation.json and calibration.json record what
 * each session spent.
 */
const REPO_SESSION = {
  minutes: { generate: 25, reference: 30, agent: 30 },
  budgetUsd: { generate: 8, reference: 12, agent: 10 },
};
export function limits(kind, chain = TOOLCHAINS.node) {
  const repo = chain.name === "repo";
  return {
    minutes: chain.sessionMinutes?.[kind] ?? (repo ? REPO_SESSION.minutes : SESSION_MINUTES)[kind],
    budgetUsd: chain.sessionBudgetUsd?.[kind] ?? (repo ? REPO_SESSION.budgetUsd : SESSION_BUDGET_USD)[kind],
  };
}
export const TOOLS = ["Bash", "Read", "Edit", "Write", "Glob", "Grep"];
/** Every session's model unless DUEDILIGENCE_MODEL or a run's --model says otherwise. */
export const DEFAULT_MODEL = "claude-opus-5-5";
/** A run folder's name for a model: its family, or the --model value as given. */
export const variantOf = (model) =>
  /opus|sonnet|haiku/.exec(model)?.[0] ?? model.replace(/[^a-z0-9.-]/gi, "-");

/**
 * The first of prompts/<toolchain.json `prompts`>/<name>.md,
 * prompts/<toolchain>/<name>.md and prompts/<name>.md (the node toolchain's)
 * that exists. A Python repository uses prompts/repo-python/, the
 * HumanEval+ imports prompts/pyfunc/, which falls back to prompts/python/.
 * Only repository prompts take `{{placeholders}}`, rendered from the spec's
 * toolchain.json; a placeholder with no value there is an error.
 */
const PROMPT_FALLBACK = { pyfunc: "python", lcb: "python", "repo-python": "repo" };
export function prompt(name, chain = TOOLCHAINS.node) {
  if (chain.name === "repo" && chain.boundary)
    throw new Error(
      `${chain.slug}: no ${name} brief for a repository spec at a black-box seam yet (prompts/repo/ assume seam files); its suites, reference and judging work by hand and by script (evidence/seams.mjs)`,
    );
  const folders = [chain.prompts, chain.name].filter(Boolean).flatMap((folder) => [folder, PROMPT_FALLBACK[folder]]);
  const own = folders.filter(Boolean).map((folder) => join(PROMPTS, folder, `${name}.md`)).find((path) => existsSync(path));
  const native = chain.name === "exec" && chain.boundary?.language !== undefined;
  if (own === undefined) {
    // prompts/<name>.md is TypeScript: never a brief for another language.
    if (!["node", "repo", "exec"].includes(chain.name) || native) throw new Error(`No prompt ${name} for the ${chain.name} toolchain (prompts/${folders[0]}/)`);
    return readFileSync(join(PROMPTS, `${name}.md`), "utf8");
  }
  const text = readFileSync(own, "utf8");
  if (native) return renderNative(text, chain, name);
  return chain.name === "repo" ? render(text, chain, name) : text;
}
/** A prompts/exec-native/ or http-native/ brief for the spec's language and boundary. */
function renderNative(text, chain, name) {
  const { brief, entry } = NATIVE[chain.boundary.language];
  const service = chain.boundary.service !== undefined;
  const argv = service ? chain.boundary.service.start : chain.boundary.command;
  const values = { ...brief, entry: entry[service ? "service" : "command"], run: Array.isArray(argv) ? argv.join(" ") : argv };
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`prompts/${chain.prompts}/${name}.md: no placeholder {{${key}}}`);
    return values[key];
  });
}

/** A list as inline code, comma-separated. */
const codeList = (items) => items.map((item) => `\`${item}\``).join(", ");
/**
 * The seam's import specifier from a suite's folder: `.js` on node:test,
 * which runs compiled ES modules, and no extension on vitest and Jest. On
 * pytest the seam's module name under the first `pythonPath` folder
 * (`src/pkg/core.py` → `pkg.core`), the same from every folder.
 */
function importOf(chain, from) {
  if (chain.runner === "pytest") {
    const root = posix.join(chain.package, chain.pythonPath[0]);
    return posix.relative(root, chain.seam[0]).replace(/(\/__init__)?\.py$/, "").split("/").join(".");
  }
  const path = posix.relative(from, chain.seam[0]).replace(/\.[cm]?[jt]sx?$/, chain.runner === "node-test" ? ".js" : "");
  return path.startsWith(".") ? path : `./${path}`;
}
function render(text, chain, name) {
  const values = {
    slug: chain.slug,
    package: chain.package,
    seam: chain.seam && codeList(chain.seam),
    import: chain.import ?? (chain.seam?.length > 0 ? importOf(chain, chain.publicDir) : undefined),
    hiddenImport: chain.seam?.length > 0 ? importOf(chain, chain.hiddenDir) : undefined,
    publicDir: chain.publicDir,
    hiddenDir: chain.hiddenDir,
    testPattern: chain.testPattern,
    publicName: chain.publicName,
    ownName: chain.ownName,
    build: chain.build,
    test: chain.test,
    testPublic: commandOf(chain, "public"),
    testHidden: commandOf(chain, "private"),
    testOwn: commandOf(chain, "own"),
    specPath: chain.specPath ?? "spec.md",
    allowedPaths: chain.allowedPaths && codeList(chain.allowedPaths),
    examples: chain.examples && codeList(chain.examples),
  };
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`prompts/${chain.prompts ?? chain.name}/${name}.md: no placeholder {{${key}}}`);
    if (values[key] === undefined) throw new Error(`${chain.slug}: toolchain.json has no value for {{${key}}}`);
    return values[key];
  });
}
export const readJson = (path, fallback) =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
export const log = (...parts) =>
  console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...parts);

/** `--flag value` and `--flag` options, and the rest as positionals. */
export function args(argv = process.argv.slice(2)) {
  const options = {};
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) rest.push(arg);
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--"))
      options[arg.slice(2)] = argv[(i += 1)];
    else options[arg.slice(2)] = true;
  }
  return { options, rest };
}

/** The specs named, or every spec with a spec.md. */
export function specSlugs(named) {
  const all = existsSync(SPECS)
    ? readdirSync(SPECS).filter((slug) => existsSync(join(SPECS, slug, "spec.md")))
    : [];
  const unknown = named.filter((slug) => !all.includes(slug));
  if (unknown.length > 0) throw new Error(`No spec: ${unknown.join(", ")}`);
  return (named.length > 0 ? named : all).sort();
}
export const specDir = (slug) => join(SPECS, slug);

/** Runs `fn` over `items`, at most `limit` at a time, in order of start. */
export async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const at = next++;
      results[at] = await fn(items[at], at);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Every file under `dir`, relative with "/" on every OS and sorted, skipping the named top-level entries. */
export function listFiles(dir, skip = ["node_modules", ".git"]) {
  const out = [];
  const walk = (at) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      const rel = slash(relative(dir, path));
      if (skip.includes(rel)) continue;
      if (entry.isDirectory()) walk(path);
      else out.push(rel);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out.sort();
}

export const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** A file's hash; a symlink hashes as its target. */
function hashOf(full) {
  return lstatSync(full).isSymbolicLink() ? `symlink:${readlinkSync(full)}` : sha256(readFileSync(full));
}
/** Path → hash of every file under `dir`, node_modules included. */
export function manifest(dir) {
  return Object.fromEntries(listFiles(dir, [".git"]).map((path) => [path, hashOf(join(dir, path))]));
}
/**
 * A staged tree's manifest. A repository tree is a git repository over its
 * base (`prepareBase`), so it is what git tracks or would track: the
 * repository's own .gitignore keeps node_modules and build output out.
 */
export function manifestOf(dir, chain) {
  if (chain?.name !== "repo") return manifest(dir);
  const listed = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (listed.status !== 0) throw new Error(`git ls-files failed in ${dir}:\n${listed.stderr}`);
  const present = (path) => {
    try {
      return lstatSync(join(dir, path)) !== undefined;
    } catch {
      return false;
    }
  };
  const paths = [...new Set(listed.stdout.split("\0").filter(Boolean))].filter(present).sort();
  return Object.fromEntries(paths.map((path) => [path, hashOf(join(dir, path))]));
}

const IGNORED = new Set([".DS_Store"]);

/** The paths `after` added, changed or removed against `before`, emitted files aside. */
export function changes(before, after, chain) {
  const generated = chain === undefined ? emitted : chain.generated;
  const out = [];
  for (const [path, hash] of Object.entries(after)) {
    if (IGNORED.has(path.split("/").at(-1)) || generated(path, after)) continue;
    const symlink = hash.startsWith("symlink:") ? { symlink: true } : {};
    if (before[path] === undefined) out.push({ path, change: "added", ...symlink });
    else if (before[path] !== hash) out.push({ path, change: "changed", ...symlink });
  }
  for (const path of Object.keys(before))
    if (after[path] === undefined) out.push({ path, change: "removed" });
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** A fresh workdir under WORK_ROOT. */
export function workdir(label) {
  return mkdtempSync(join(WORK_ROOT, `${label}-`));
}

/** Copies `from` (a file or a directory's contents) to `to`. */
export function copy(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  // Verbatim, or node_modules/.bin links would point back into the template,
  // which a session cannot read.
  cpSync(from, to, { recursive: true, verbatimSymlinks: true });
}

/**
 * A copy of a prepared base tree, by clonefile where the filesystem has it
 * (`cp -c` on macOS, `--reflink=auto` on Linux): a repository with its
 * node_modules is too large to copy byte for byte per session.
 */
function clone(from, to) {
  mkdirSync(to, { recursive: true });
  // Windows has neither: a plain copy.
  const flags = { darwin: ["-Rc"], linux: ["-R", "--reflink=auto"] }[process.platform];
  if (flags !== undefined && spawnSync("cp", [...flags, `${from}/.`, to]).status === 0) return;
  copy(from, to);
}

/**
 * Repository targets. A base tree is one commit of a repository with its
 * dependencies installed on the host, since sessions have no network and
 * never install: `git archive <sha>`, the package manager's frozen
 * install, then each workspace package in `buildFirst` built in order
 * (the target imports their dist/, which git does not hold), then a
 * one-commit git repository over the result, which `manifestOf` reads.
 * WORK_ROOT/bases/<repo>-<sha>/ is shared by every spec on that commit, and
 * a base with workspace builds (`-<hash of buildFirst>`) starts as a clone
 * of it; TARGETS/<slug>/<sha>/ is a spec's clone of its base, which `stage`
 * clones per tree. Each is prepared again when it is missing (tmpdir is
 * purged).
 */
export const BASES = join(WORK_ROOT, "bases");
/** Each package manager's frozen install, by the version `packageManager` names. */
const INSTALL = {
  npm: (version = "10.9.2") => ["npx", "-y", `npm@${version}`, "ci", "--no-audit", "--no-fund"],
  pnpm: (version = "9") => ["npx", "-y", `pnpm@${version}`, "install", "--frozen-lockfile"],
  yarn: (version = "1") =>
    version.startsWith("1.")
      ? ["npx", "-y", `yarn@${version}`, "install", "--frozen-lockfile"]
      : ["corepack", `yarn@${version}`, "install", "--immutable"],
};
/**
 * A Python tool (uv, poetry) the host installs repositories with, in its own
 * venv under WORK_ROOT/tools/<name>-<version>/, installed with pip once.
 */
function pythonTool(name, version) {
  const dir = join(WORK_ROOT, "tools", `${name}-${version}`);
  const bin = join(dir, venvBin(name, "."));
  if (existsSync(bin)) return bin;
  const partial = `${dir}.partial-${process.pid}`;
  rmSync(partial, { recursive: true, force: true });
  mkdirSync(dirname(partial), { recursive: true });
  for (const argv of [
    [PYTHON, "-m", "venv", partial],
    [join(partial, venvBin("python", ".")), "-m", "pip", "install", "-q", "--disable-pip-version-check", `${name}==${version}`],
  ]) {
    const out = spawnSync(argv[0], argv.slice(1), { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    if (out.status !== 0) {
      rmSync(partial, { recursive: true, force: true });
      throw new Error(`installing ${name} ${version} failed:\n${`${out.error ?? ""}${out.stdout}${out.stderr}`.slice(-4000)}`);
    }
  }
  if (existsSync(bin)) rmSync(partial, { recursive: true, force: true });
  else renameSync(partial, dir);
  return bin;
}
/**
 * Each Python package manager's frozen install, as steps run at the
 * repository root that leave its environment in .venv/ there (VENV_PYTHON),
 * on PYTHON, never downloading an interpreter. The project itself is
 * installed for its metadata, not in editable mode: a suite puts the
 * tree's own source first on the path (toolchain.json `pythonPath`), so
 * every staged tree runs its own code. `requirements` (pip) lists the
 * requirements files fit found, `groups` (uv) the dependency groups.
 */
const PYTHON_INSTALL = {
  uv: (version = "0.12.24", config) => [
    [
      pythonTool("uv", version),
      "sync",
      "--frozen",
      "--all-extras",
      "--no-editable",
      "--python",
      PYTHON,
      // The project's default groups, plus its dev and test groups (fit's `groups`).
      ...(config.groups ?? []).flatMap((group) => ["--group", group]),
    ],
  ],
  poetry: (version = "2.4.3") => [
    [pythonTool("poetry", version), "env", "use", PYTHON],
    [pythonTool("poetry", version), "install", "--no-interaction", "--all-extras"],
  ],
  pip: (_, config) => [
    [PYTHON, "-m", "venv", ".venv"],
    ...(config.requirements ?? []).map((file) => [VENV_PYTHON, "-m", "pip", "install", "-q", "--disable-pip-version-check", "-r", file]),
    ...(config.installProject === false ? [] : [[VENV_PYTHON, "-m", "pip", "install", "-q", "--disable-pip-version-check", "--no-deps", "."]]),
  ],
};
const PYTHON_ENV = { UV_PROJECT_ENVIRONMENT: ".venv", UV_PYTHON_DOWNLOADS: "never", POETRY_VIRTUALENVS_IN_PROJECT: "true", PIP_NO_INPUT: "1" };
export const PACKAGE_MANAGERS = [...Object.keys(INSTALL), ...Object.keys(PYTHON_INSTALL)];
export const baseTree = (config) =>
  join(
    BASES,
    `${basename(config.repo)}-${config.base}${(config.buildFirst ?? []).length === 0 ? "" : `-${sha256(JSON.stringify(config.buildFirst)).slice(0, 8)}`}`,
  );
const BASE_RECORD = join(".git", "duediligence-base.json");
const GIT_IDENTITY = ["-c", "user.name=duediligence", "-c", "user.email=duediligence@localhost"];

/** The prepared base tree of `config` (toolchain.json's fields), preparing it if it is missing. */
export function prepareBase(config) {
  const dest = baseTree(config);
  if (existsSync(join(dest, BASE_RECORD))) return dest;
  mkdirSync(BASES, { recursive: true });
  const partial = mkdtempSync(`${dest}.partial-`);
  const started = Date.now();
  const step = (label, bin, argv, options = {}) => {
    const out = spawnCommand(bin, argv, { cwd: partial, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...options });
    if (out.status === 0) return out;
    rmSync(partial, { recursive: true, force: true });
    throw new Error(`${label} failed:\n${`${out.error ?? ""}${out.stdout}${out.stderr}`.slice(-4000)}`);
  };
  const buildFirst = config.buildFirst ?? [];
  if (buildFirst.length > 0) {
    rmSync(partial, { recursive: true, force: true });
    clone(prepareBase({ ...config, buildFirst: [] }), partial);
  } else {
    const tar = join(partial, ".base.tar");
    step("git archive", "git", ["-C", config.repo, "archive", "--format=tar", "-o", tar, config.base]);
    step("tar", "tar", ["-xf", tar]);
    rmSync(tar);
    const [manager, version] = (config.packageManager ?? "npm").split("@");
    if (PYTHON_INSTALL[manager] !== undefined)
      for (const [bin, ...argv] of PYTHON_INSTALL[manager](version, config)) {
        log(`${basename(config.repo)} ${config.base.slice(0, 12)}: ${basename(bin)} ${argv.join(" ")}`);
        step(`${manager} install`, bin, argv, { env: installEnv(PYTHON_ENV) });
      }
    else {
      if (INSTALL[manager] === undefined) throw new Error(`No install for package manager ${manager}`);
      const [bin, ...argv] = INSTALL[manager](version);
      log(`${basename(config.repo)} ${config.base.slice(0, 12)}: ${bin} ${argv.join(" ")}`);
      // HUSKY=0: a `prepare` script that installs git hooks has no repository here.
      step(`${manager} install`, bin, argv, { env: installEnv({ HUSKY: "0" }) });
    }
  }
  for (const folder of buildFirst) {
    const script = readJson(join(partial, folder, "package.json"), {}).scripts?.build;
    if (script === undefined) continue;
    log(`${basename(config.repo)} ${config.base.slice(0, 12)}: build ${folder}`);
    const cwd = join(partial, folder);
    // Through the OS shell, as npm runs the package's own build script.
    step(`build of ${folder}`, script, [], { cwd, env: withBins(cwd), shell: true, windowsHide: true });

  }
  // Build output is ignored by the repository's .gitignore, so a built base
  // keeps the plain base's commit.
  if (buildFirst.length === 0) {
    step("git init", "git", ["init", "-q"]);
    writeFileSync(join(partial, ".git", "info", "exclude"), "node_modules/\n.venv/\n__pycache__/\n.pytest_cache/\n");
    step("git add", "git", ["add", "-A"]);
    step("git commit", "git", [...GIT_IDENTITY, "commit", "-qm", `base ${config.base}`, "--no-verify"]);
  }
  writeJson(join(partial, BASE_RECORD), {
    repo: config.repo,
    base: config.base,
    packageManager: config.packageManager ?? "npm",
    buildFirst,
    seconds: Math.round((Date.now() - started) / 1000),
    at: new Date().toISOString(),
  });
  if (existsSync(dest)) rmSync(partial, { recursive: true, force: true });
  else renameSync(partial, dest);
  return dest;
}

/** A repository target's tree, TARGETS/<slug>/<sha>/, cloned from its base tree when missing. */
export function ensureTarget(chain) {
  if (existsSync(join(chain.template, BASE_RECORD))) return chain.template;
  const base = prepareBase(chain);
  if (base === chain.template) return base;
  const partial = `${chain.template}.partial-${process.pid}`;
  rmSync(partial, { recursive: true, force: true });
  clone(base, partial);
  if (existsSync(chain.template)) rmSync(partial, { recursive: true, force: true });
  else renameSync(partial, chain.template);
  return chain.template;
}

/**
 * A staged project: the template (with its installed compiler), the spec,
 * and any of skeleton, public tests, hidden tests, or a `src/` to use in
 * place of the skeleton's. On a repository target the template is the
 * prepared base tree, the skeleton is the seam files at their repository
 * paths, and `src` is a submission snapshot laid over the tree at the
 * same paths.
 */
export function stage(dir, slug, parts = {}) {
  // `parts.chain`: a repository no spec targets yet (bin/fit.mjs), staged bare.
  const chain = parts.chain ?? toolchainOf(slug);
  const spec = slug === null ? null : specDir(slug);
  if (chain.name === "repo") {
    clone(ensureTarget(chain), dir);
    if (parts.spec !== false) copy(join(spec, "spec.md"), join(dir, "spec.md"));
    // A spec at a black-box boundary may have no seam files: base is its stub.
    if (parts.skeleton && existsSync(join(spec, "skeleton"))) copy(join(spec, "skeleton"), dir);
    if (parts.src !== undefined) copy(parts.src, dir);
    for (const path of parts.remove ?? []) rmSync(join(dir, path), { force: true });
    if (parts.publicTests) copy(join(spec, "tests", "public"), join(dir, chain.publicDir));
    if (parts.hiddenTests) copy(join(spec, "tests", "private"), join(dir, chain.hiddenDir));
    // Inside .git, which no manifest lists, so it is never a change.
    if (chain.boundary) writeBoundary(join(dir, ".git", "duediligence"), chain);
    return dir;
  }
  copy(chain.ensure !== undefined ? chain.ensure() : chain.template === TEMPLATE ? ensureTemplate() : chain.template, dir);
  if (chain.name === "exec") {
    writeBoundary(join(dir, "sandbox"), chain);
    const native = NATIVE[chain.boundary.language];
    if (native !== undefined) {
      copy(join(RUNNERS, "native-build.mjs"), join(dir, "sandbox", "build.mjs"));
      for (const [path, text] of Object.entries(native.files)) writeFileSync(join(dir, path), text);
      // `npm test` builds through it too: the suites, then src/.
      const pkg = readJson(join(dir, "package.json"));
      writeJson(join(dir, "package.json"), { ...pkg, scripts: { ...pkg.scripts, build: "node sandbox/build.mjs" } });
    }
    // `npm test` and the node-test runner load sandbox.env: a command boundary needs no wrapper there.
    if (chain.boundary.command !== undefined)
      writeFileSync(
        join(dir, "sandbox.env"),
        `${readFileSync(join(dir, "sandbox.env"), "utf8")}BOUNDARY_COMMAND='${JSON.stringify(chain.boundary.command)}'\n`,
      );
  }
  if (parts.spec !== false) copy(join(spec, "spec.md"), join(dir, "spec.md"));
  if (parts.skeleton) copy(join(spec, "skeleton", "src"), join(dir, "src"));
  if (parts.src !== undefined) {
    rmSync(join(dir, "src"), { recursive: true, force: true });
    copy(parts.src, join(dir, "src"));
  }
  if (parts.publicTests) copy(join(spec, "tests", "public"), join(dir, "tests", "public"));
  if (parts.hiddenTests) copy(join(spec, "tests", "private"), join(dir, "tests", "private"));
  return dir;
}

/** boundary.mjs and its boundary.json in `folder` of a staged tree, for sessions and the judge alike. */
function writeBoundary(folder, chain) {
  copy(join(RUNNERS, "boundary.mjs"), join(folder, "boundary.mjs"));
  writeJson(join(folder, "boundary.json"), boundaryConfig(chain));
}

/** Checks a staged project with its toolchain's own compiler. */
export function build(dir, chain = toolchainIn(dir)) {
  const [bin, argv, options] = chain.check(dir, chain);
  const run = spawnSync(bin, argv, { cwd: dir, encoding: "utf8", ...options });
  return { ok: run.status === 0, output: `${run.stdout}${run.stderr}`.trim() };
}

/** The toolchain's suite runner (bin/runners/) on a staged project: the suite's outcome, as it prints it. */
export function runSuite(dir, suite, chain = toolchainIn(dir)) {
  const [bin, argv, options] = chain.suite(dir, suite, chain);
  const run = spawnSync(bin, argv, {
    cwd: dir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  try {
    return JSON.parse(run.stdout);
  } catch {
    throw new Error(`${argv[0]} ${suite} printed no result in ${dir}:\n${run.stderr}`);
  }
}

/**
 * A `src/` judged as grading judges it: copied onto a fresh template with
 * the public suite, then onto another with the hidden suite, so code that
 * ran beside the public tests never had the hidden ones in reach. On a
 * repository target `src` is a snapshot of the changed files at their
 * repository paths, laid over base plus stub, with the paths in `remove`
 * deleted; `existing` also runs the repository's own suite on the public
 * tree.
 */
export function judge(slug, src, { existing = false, remove = [] } = {}) {
  const chain = toolchainOf(slug);
  const repo = chain.name === "repo";
  const run = (suites, parts) => {
    const dir = stage(mkdtempSync(join(JUDGE_ROOT, `${slug}-${suites[0]}-`)), slug, {
      spec: false,
      skeleton: repo,
      src,
      remove,
      ...parts,
    });
    try {
      return suites.map((suite) => runSuite(dir, suite, chain));
    } finally {
      discard(dir);
    }
  };
  const [publicResult, existingResult] = run(repo && existing ? ["public", "existing"] : ["public"], {
    publicTests: true,
  });
  const [hidden] = run(["private"], { hiddenTests: true });
  return { public: publicResult, hidden, ...(existingResult === undefined ? {} : { existing: existingResult }) };
}

/**
 * The existing suite's outcome as specs/<slug>/baseline.json keeps it: which
 * tests passed and which did not (a crashed file's tests are absent).
 */
export function baselineOf(result, stage) {
  const tests = testsOf(result);
  return {
    stage,
    at: new Date().toISOString(),
    compiled: result.compiled,
    passing: tests.filter((test) => test.ok && !test.skipped).map((test) => test.id),
    failing: tests.filter((test) => !test.ok).map((test) => test.id),
    crashed: result.files.filter((file) => file.crashed).map((file) => file.file),
  };
}
/** Whether a repository path is one the implementer may change: in a folder of `allowedPaths` (ending in `/`) or one of its files. */
export const allowedPath = (chain, path) => allowedIn(chain.allowedPaths, path);

/**
 * The claude CLI, or null: CLAUDE_BIN, claude on PATH, the newest VS Code
 * extension's bundled binary. On Windows npm's `claude.cmd` shim is
 * replaced by the package it starts (its native claude.exe, or cli.js on
 * this Node), since a shim runs only through cmd.exe and a prompt does not
 * survive its quoting.
 */
export function findClaude() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const onPath = which("claude");
  if (onPath !== null && !/\.(cmd|bat|ps1)$/i.test(onPath)) return onPath;
  if (onPath !== null) {
    const pkg = join(dirname(onPath), "node_modules", "@anthropic-ai", "claude-code");
    const shipped = [join(pkg, "bin", "claude.exe"), join(pkg, "cli.js")].find((path) => existsSync(path));
    if (shipped !== undefined) return shipped;
  }
  const extensions = join(homedir(), ".vscode", "extensions");
  const bundled = existsSync(extensions)
    ? readdirSync(extensions)
        .filter((name) => name.startsWith("anthropic.claude-code-"))
        .map((name) => join(extensions, name, "resources", "native-binary", WINDOWS ? "claude.exe" : "claude"))
        .filter((path) => existsSync(path))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    : [];
  return bundled.at(-1) ?? null;
}
export function claudeBin() {
  const found = findClaude();
  if (found === null)
    throw new Error("No claude CLI: set CLAUDE_BIN, put claude on PATH, or install the VS Code extension. Or pick another backend: DUEDILIGENCE_BACKEND=codex-cli or anthropic-api.");
  return found;
}
/** How to start `claude` with `argv`: [bin, argv]; a cli.js runs on this Node. */
const claudeCommand = (argv) => {
  const bin = claudeBin();
  return /\.[cm]?js$/.test(bin) ? [process.execPath, [bin, ...argv]] : [bin, argv];
};

/**
 * Absolute path as a permission rule takes it: `//` and the path, which on
 * Windows Claude Code matches in POSIX form (C:\Users\me as //c/Users/me).
 */
const posixForm = (path) => (WINDOWS ? `/${path[0].toLowerCase()}${slash(path.slice(2))}` : path);
const rulePath = (path) => `/${posixForm(path)}/**`;

/** The workdirs that exist now, other than `own` and the judge root. */
const siblings = (own) =>
  readdirSync(WORK_ROOT)
    .map((name) => join(WORK_ROOT, name))
    .filter((path) => path !== own && path !== JUDGE_ROOT);

/** RESULTS, when no folder of PRIVATE holds it: a file, so its rule has no `/**`. */
const resultsFile = () => (PRIVATE.some((folder) => inside(RESULTS, folder)) ? [] : [RESULTS]);

/**
 * A spec whose boundary is a service (`boundaryOf`) needs its sessions to
 * listen on and connect to 127.0.0.1, so its sandbox allows local binding;
 * every other session's settings are unchanged, still with no network.
 *
 * On Windows Claude Code has no OS sandbox to require: the sandbox is asked
 * for where it exists and not required, so Bash there is held by nothing
 * but the transcript audit (`peeks`, `audit`), and `claudeCli` records
 * `sandboxed: false` and says so once.
 */
export function sessionSettings(cwd, chain) {
  const denied = [...PRIVATE, TRANSCRIPTS, JUDGE_ROOT, ...siblings(cwd)];
  const fileTools = ["Read", "Edit", "Write", "Glob", "Grep"];
  return {
    sandbox: {
      enabled: true,
      failIfUnavailable: OS_SANDBOX,
      allowUnsandboxedCommands: false,
      filesystem: {
        denyRead: [...PRIVATE, ...resultsFile(), TRANSCRIPTS, WORK_ROOT],
        allowRead: [cwd],
      },
      ...(chain?.boundary?.service !== undefined ? { network: { allowLocalBinding: true } } : {}),
    },
    permissions: {
      deny: [
        "WebFetch",
        "WebSearch",
        ...denied.flatMap((path) => fileTools.map((tool) => `${tool}(${rulePath(path)})`)),
        ...resultsFile().flatMap((path) => fileTools.map((tool) => `${tool}(/${posixForm(path)})`)),
      ],
    },
  };
}

/**
 * Every session of every script here takes a slot first: at most
 * DUEDILIGENCE_MAX_SESSIONS at once (default 3), and none starts while
 * less than DUEDILIGENCE_MIN_FREE percent of memory is free (default
 * 25): macOS's `memory_pressure`, elsewhere the OS's available memory. A
 * slot is a file under WORK_ROOT/slots holding its owner's pid; a dead
 * owner's slot is taken back.
 */
const MAX_SESSIONS = Number(process.env.DUEDILIGENCE_MAX_SESSIONS ?? 3);
const MIN_FREE = Number(process.env.DUEDILIGENCE_MIN_FREE ?? 25);
const SLOTS = join(WORK_ROOT, "slots");
export function freeMemoryPercent() {
  if (process.platform !== "darwin") return Math.round((freemem() / totalmem()) * 100);
  const out = spawnSync("memory_pressure", [], { encoding: "utf8" }).stdout ?? "";
  const match = /free percentage:\s*(\d+)%/.exec(out);
  return match === null ? 100 : Number(match[1]);
}
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
export async function takeSlot() {
  mkdirSync(SLOTS, { recursive: true });
  for (let waited = 0; ; waited += 1) {
    if (freeMemoryPercent() >= MIN_FREE)
      for (let i = 0; i < MAX_SESSIONS; i += 1) {
        const path = join(SLOTS, `slot-${i}`);
        try {
          writeFileSync(path, String(process.pid), { flag: "wx" });
          return path;
        } catch {
          const owner = Number(existsSync(path) ? readFileSync(path, "utf8") : 0);
          if (owner > 0 && !alive(owner)) rmSync(path, { force: true });
        }
      }
    if (waited % 60 === 1)
      log(`waiting for a session slot (${MAX_SESSIONS} max, ${MIN_FREE}% memory free)`);
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}

/**
 * The writer backends (bin/backends.mjs): `claude-cli` (this file's
 * `claudeCli`, blind by the deny rules above), `anthropic-api`, `codex-cli`
 * and `exec`, blind by placement (an OS sandbox over the staged workdir).
 */
export const BACKENDS = ["claude-cli", "anthropic-api", "codex-cli", "exec"];
/**
 * A session's backend: `backend` when the caller names one (a run's
 * --backend, the referee's), else for the writers and the reference
 * DUEDILIGENCE_BACKEND, then toolchain.json `backend`, then
 * `defaultBackend`. The implementing agent (`kind: "agent"`) skips the
 * writers' choice unless its caller names one: a spec's writer backend is
 * not its implementer.
 */
export function backendOf({ backend, kind, chain } = {}) {
  const chosen =
    backend ?? (kind === "agent" ? undefined : (process.env.DUEDILIGENCE_BACKEND || chain?.backend)) ?? defaultBackend();
  if (!BACKENDS.includes(chosen)) throw new Error(`No backend ${chosen} (${BACKENDS.join(", ")})`);
  return chosen;
}
/** Whether the person has a Codex login (CODEX_HOME or ~/.codex) or an OpenAI key for it. */
const codexSignedIn = () =>
  existsSync(join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "auth.json")) ||
  Boolean(process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY);
let defaultChosen;
/**
 * The backend a session runs on when nothing names one: whichever of the
 * person's accounts is there, in this order. claude-cli when a claude CLI
 * is found (`findClaude`), else codex-cli on their Codex login, else
 * anthropic-api on ANTHROPIC_API_KEY. None of them is an error that names
 * all three. Said once when it is not claude-cli.
 */
export function defaultBackend() {
  if (defaultChosen !== undefined) return defaultChosen;
  defaultChosen =
    findClaude() !== null
      ? "claude-cli"
      : codexSignedIn()
        ? "codex-cli"
        : process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN
          ? "anthropic-api"
          : null;
  if (defaultChosen === null)
    throw new Error(
      "No agent to run sessions on. Any one of: Claude Code signed in (`claude`, or CLAUDE_BIN), a Codex login (`codex login`, or OPENAI_API_KEY), or ANTHROPIC_API_KEY. DUEDILIGENCE_BACKEND picks one when you have several.",
    );
  if (defaultChosen !== "claude-cli") log(`no claude CLI found: sessions run on ${defaultChosen} (DUEDILIGENCE_BACKEND picks another)`);
  return defaultChosen;
}
/**
 * One writer, reference, referee or agent session in `cwd` on its backend
 * (`backendOf`). Every backend writes the same transcript shape, Claude
 * Code's stream-json (`peeks`, `audit` and the reports read it), and
 * resolves with the same record; none rejects on the session's own failure.
 */
export async function session(options) {
  const backend = backendOf(options);
  const { runBackend } = backend === "claude-cli" ? {} : await import("./backends.mjs");
  const result = backend === "claude-cli" ? await claudeCli(options) : await runBackend(backend, options);
  killStrays(options.cwd);
  return result;
}
/**
 * Processes a session left running, such as a server it started in the
 * background to try its code (an Opus writer's `scratchpad/ref.mjs`
 * outlived its session by seven hours, 2026-10-27): SIGKILLed with their
 * process groups once the session ends. A process is the session's when
 * its working directory is inside the workdir, or its working directory or
 * command line names the workdir as Claude Code encodes it in its own
 * scratch and project folders (every character but a letter or digit as
 * `-`). Not by the literal path in a command line: a concurrent session's
 * `claude` argv lists every sibling workdir in its deny rules, and killing
 * it on that (2026-10-27, one Haiku run) was this function's first bug. Working
 * directories from `lsof -d cwd` on macOS, /proc on Linux; command lines
 * from `ps`. Never this process or its own group. The session's own
 * process group goes first (`claudeCli` and bin/backends.mjs start each
 * session as a group leader and kill that group when it closes). Windows
 * has no process groups or readable working directories: there the
 * session's process tree is all that is killed (`killTree`).
 */
export function killStrays(cwd) {
  if (WINDOWS) return [];
  let root;
  try {
    root = realpathSync(cwd);
  } catch {
    return [];
  }
  const names = [...new Set([root, root.replace(/^\/private\//, "/")])];
  const encoded = names.map((path) => path.replace(/[^A-Za-z0-9]/g, "-"));
  // A command line is matched by the encoded name only: another session's own
  // argv names this workdir literally (its deny rules list every sibling).
  const atCwd = (path) => names.some((name) => inside(path, name)) || encoded.some((name) => path.includes(name));
  const inArgv = (command) => encoded.some((name) => command.includes(name));
  const found = new Set();
  if (process.platform === "linux") {
    for (const pid of existsSync("/proc") ? readdirSync("/proc").filter((name) => /^\d+$/.test(name)) : []) {
      try {
        if (atCwd(readlinkSync(`/proc/${pid}/cwd`))) found.add(Number(pid));
      } catch {}
    }
  } else {
    const listed = spawnSync("lsof", ["-d", "cwd", "-Fpn"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).stdout ?? "";
    let pid = null;
    for (const line of listed.split("\n")) {
      if (line.startsWith("p")) pid = Number(line.slice(1));
      else if (line.startsWith("n") && pid !== null && atCwd(line.slice(1))) found.add(pid);
    }
  }
  const table = (spawnSync("ps", ["-axo", "pid=,pgid=,command="], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).stdout ?? "")
    .split("\n")
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
    .filter(Boolean)
    .map(([, pid, pgid, command]) => ({ pid: Number(pid), pgid: Number(pgid), command }));
  for (const row of table) if (inArgv(row.command)) found.add(row.pid);
  const ownGroup = table.find((row) => row.pid === process.pid)?.pgid;
  const strays = [...found].filter((pid) => pid !== process.pid && pid !== process.ppid);
  for (const pid of strays) {
    const pgid = table.find((row) => row.pid === pid)?.pgid;
    for (const target of [...(pgid !== undefined && pgid !== ownGroup && pgid > 1 ? [-pgid] : []), pid])
      try {
        process.kill(target, "SIGKILL");
      } catch {}
  }
  if (strays.length > 0) log(`killed ${strays.length} process(es) the session left running in ${root}`);
  return strays;
}
/** Kills a session's process group, or its tree on Windows (its leader `pid` was spawned with `GROUP`); quiet when it is gone. */
export const killGroup = killTree;
/** Said once per process when a session runs without an OS sandbox. */
let warnedUnsandboxed = false;
export function warnUnsandboxed() {
  if (warnedUnsandboxed) return;
  warnedUnsandboxed = true;
  log(
    `${process.platform}: no OS sandbox for sessions here. File tools are held by deny rules; Bash is not, so a read of the hidden suite is caught by the transcript audit, not prevented. For an enforced sandbox, run under WSL2, macOS or Linux.`,
  );
}

/**
 * One `claude -p` session in `cwd`, its stream-json transcript written to
 * `transcript`. Resolves with what the final result line says; never
 * rejects on the session's own failure. Sessions bill the signed-in Claude
 * subscription: an API key or token in the environment would take
 * precedence over it, so neither is passed.
 */
export async function claudeCli({ cwd, text, transcript, kind, resume, model, maxTurns, chain }) {
  const { minutes, budgetUsd } = limits(kind, chain);
  const argv = [
    "-p",
    text,
    "--output-format",
    "stream-json",
    "--verbose",
    "--safe-mode",
    "--strict-mcp-config",
    "--no-chrome",
    "--disable-slash-commands",
    "--tools",
    TOOLS.join(","),
    "--permission-mode",
    "bypassPermissions",
    "--max-budget-usd",
    String(budgetUsd),
    "--settings",
    JSON.stringify(sessionSettings(cwd, chain)),
    "--model",
    model ?? process.env.DUEDILIGENCE_MODEL ?? DEFAULT_MODEL,
    ...(resume ? ["--resume", resume] : []),
    ...(maxTurns ? ["--max-turns", String(maxTurns)] : []),
  ];
  mkdirSync(dirname(transcript), { recursive: true });
  const slot = await takeSlot();
  const started = Date.now();
  return new Promise((resolve) => {
    const { ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ...env } = process.env;
    // Its own process group, killed when it closes (and if this process exits first): a
    // server a session left in the background goes with it (`killStrays` catches the rest).
    if (!OS_SANDBOX) warnUnsandboxed();
    const [bin, args] = claudeCommand(argv);
    const child = spawn(bin, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], ...GROUP });
    const reap = () => killGroup(child.pid);
    process.once("exit", reap);
    // Once the CLI itself exits, anything left in its group is a leftover that may hold its pipes open.
    child.on("exit", reap);
    const chunks = [];
    let stderr = "";
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
    }, minutes * 60_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      reap();
      process.removeListener("exit", reap);
      rmSync(slot, { force: true });
      const out = Buffer.concat(chunks).toString("utf8");
      writeFileSync(
        transcript,
        resume && existsSync(transcript) ? readFileSync(transcript, "utf8") + out : out,
      );
      const lines = out
        .split("\n")
        .filter((line) => line.startsWith("{"))
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      const result = lines.findLast((line) => line.type === "result") ?? null;
      const init = lines.find((line) => line.type === "system" && line.subtype === "init");
      resolve({
        sessionId: result?.session_id ?? init?.session_id ?? null,
        model: init?.model ?? null,
        ok: code === 0 && result !== null && result.is_error !== true && !timedOut,
        exitCode: code,
        timedOut,
        costUsd: result?.total_cost_usd ?? null,
        turns: result?.num_turns ?? null,
        durationMs: Date.now() - started,
        subtype: result?.subtype ?? null,
        /** The API's refusal, such as `usage_limit_reached`, or null. */
        apiError: result?.api_error ?? null,
        finalText: typeof result?.result === "string" ? result.result : "",
        stderr: stderr.slice(-2000),
        /** False where no OS sandbox held the session's Bash (Windows). */
        sandboxed: OS_SANDBOX,
      });
    });
  });
}

/**
 * What a change to a repository target may touch, path by path. `changed`
 * is `changes()` output against base plus stub plus public suite; `read`
 * returns a changed file's text. Each path lands in one list:
 *
 * - `refused`, harness: the public suite (changed or removed), the hidden dir, a test file that
 *   existed before (changed or removed), package.json, a lockfile, a
 *   tsconfig, vite/vitest, Jest or Babel config, the Python project and
 *   pytest files (pyproject.toml, requirements, conftest.py, ...), go.mod
 *   or Cargo files, node_modules or .venv, spec.md, any symlink,
 *   and task code that names the hidden dir (sandbox-factory's grading
 *   refuses task code that imports the test run the same way);
 * - `ownTests`: test files the implementer added, which are not judged;
 * - `allowed`: in allowedPaths;
 * - `outsideScope`: anything else, judged but reported, and refused only
 *   under --strict-scope.
 */
export const HARNESS_FILES =
  /^(package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|yarn\.lock|bun\.lockb?|tsconfig(\..+)?\.json|vite(st)?\.(config|workspace)\.[cm]?[jt]s|jest\.config\.[cm]?[jt]s(on)?|babel\.config\.[cm]?[jt]s(on)?|\.babelrc|pyproject\.toml|setup\.(py|cfg)|requirements[^/]*\.txt|uv\.lock|poetry\.lock|Pipfile(\.lock)?|tox\.ini|pytest\.ini|noxfile\.py|conftest\.py|go\.(mod|sum)|Cargo\.(toml|lock))$/;
export function scopeOf(chain, changed, read) {
  const out = { refused: [], ownTests: [], allowed: [], outsideScope: [] };
  const hiddenName = basename(chain.hiddenDir);
  for (const item of changed) {
    const { path } = item;
    const name = basename(path);
    const harness =
      item.symlink === true
        ? "a symlink"
        : path.startsWith(`${chain.hiddenDir}/`)
          ? "the hidden suite's folder"
          : // Added is never an edit: a run without the public suite may name its own tests so.
            posix.dirname(path) === chain.publicDir && chain.isPublicName(name) && item.change !== "added"
            ? "the public suite"
            : chain.isTest(path) && item.change !== "added"
              ? "an existing test"
              : HARNESS_FILES.test(name) || path === "spec.md"
                ? "harness"
                : path.split("/").some((part) => part === "node_modules" || part === ".venv")
                  ? "installed dependencies"
                  : item.change !== "removed" && (read(path) ?? "").includes(hiddenName)
                    ? `task code naming ${hiddenName}`
                    : null;
    if (harness !== null) out.refused.push({ ...item, reason: harness });
    else if (chain.isTest(path)) out.ownTests.push(item);
    else if (allowedPath(chain, path)) out.allowed.push(item);
    else out.outsideScope.push(item);
  }
  return out;
}
/** `{path (change)}` lines for a scope list. */
export const pathsOf = (items) =>
  items.map((item) => `${item.path} (${item.change}${item.reason ? `: ${item.reason}` : ""})`);

/**
 * A spec's starting tree as handed to an implementer: base, then the stub,
 * then the public suite. `startOf(path)` is a file's content there, or null.
 */
function startOf(chain) {
  const spec = specDir(chain.slug);
  const stubbed = (path) =>
    chain.seam.includes(path) ? join(spec, "skeleton", path) : null;
  const publicFile = (path) =>
    posix.dirname(path) === chain.publicDir ? join(spec, "tests", "public", posix.basename(path)) : null;
  return (path) => {
    for (const file of [stubbed(path), publicFile(path)])
      if (file !== null && existsSync(file)) return readFileSync(file);
    const shown = spawnSync("git", ["-C", chain.repo, "show", `${chain.base}:${path}`], { maxBuffer: 256 * 1024 * 1024 });
    return shown.status === 0 ? shown.stdout : null;
  };
}

/**
 * What a checkout of the target's repository changed against base plus
 * stub plus public suite: its working tree (tracked files, untracked files
 * git does not ignore, deletions), or the commit `ref`. Files that end up
 * as they started (the stub and public suite a handout wrote, unchanged)
 * are no change, and so is a public file the checkout does not have. Returns `changes()`-shaped items and `read(path)`, the
 * changed file's content now.
 */
export function checkoutChanges(chain, checkout, ref) {
  const git = (...argv) =>
    spawnSync("git", ["-C", checkout, ...argv], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const top = git("rev-parse", "--show-toplevel");
  if (top.status !== 0) throw new Error(`${checkout} is not a git checkout`);
  const root = top.stdout.trim();
  if (git("cat-file", "-e", `${chain.base}^{commit}`).status !== 0)
    throw new Error(`${root} does not have the base commit ${chain.base}`);
  // From the root: ls-files names paths relative to the folder it runs in.
  const listed = (...argv) => git("-C", root, ...argv).stdout.split("\0").filter(Boolean);
  const named = ref === undefined
    ? [
        ...listed("diff", "--name-only", "-z", "--no-renames", chain.base),
        ...listed("ls-files", "-z", "--others", "--exclude-standard"),
      ]
    : listed("diff", "--name-only", "-z", "--no-renames", chain.base, ref);
  const publicPaths = new Set(listFiles(join(specDir(chain.slug), "tests", "public")).map((name) => posix.join(chain.publicDir, name)));
  const paths = [...new Set([...named, ...chain.seam, ...publicPaths])].sort();
  const start = startOf(chain);
  const now = (path) => {
    if (ref !== undefined) {
      const shown = spawnSync("git", ["-C", root, "show", `${ref}:${path}`], { maxBuffer: 256 * 1024 * 1024 });
      return shown.status === 0 ? shown.stdout : null;
    }
    const full = join(root, path);
    try {
      return lstatSync(full).isSymbolicLink() ? Buffer.from(`symlink:${readlinkSync(full)}`) : readFileSync(full);
    } catch {
      return null;
    }
  };
  const symlink = (path) => {
    if (ref !== undefined) return /^120000 /.test(git("ls-tree", ref, "--", path).stdout);
    try {
      return lstatSync(join(root, path)).isSymbolicLink();
    } catch {
      return false;
    }
  };
  const items = [];
  const contents = new Map();
  for (const path of paths) {
    if (IGNORED.has(basename(path)) || chain.generated(path)) continue;
    const before = start(path);
    const after = now(path);
    if (before === null && after === null) continue;
    // A checkout that never had the handout: the judge stages the public suite itself.
    if (after === null && publicPaths.has(path)) continue;
    if (before !== null && after !== null && before.equals(after)) continue;
    contents.set(path, after);
    items.push({
      path,
      change: before === null ? "added" : after === null ? "removed" : "changed",
      ...(symlink(path) ? { symlink: true } : {}),
    });
  }
  return { root, items, read: (path) => contents.get(path)?.toString("utf8") ?? null, content: (path) => contents.get(path) };
}

/** Writes the judged files of a scope (allowed and outside scope, not removed) into `dir`: the snapshot `judge` lays over the tree. */
export function writeSnapshot(dir, scope, content) {
  const judged = [...scope.allowed, ...scope.outsideScope];
  for (const item of judged.filter((item) => item.change !== "removed")) {
    mkdirSync(dirname(join(dir, item.path)), { recursive: true });
    writeFileSync(join(dir, item.path), content(item.path));
  }
  return judged.filter((item) => item.change === "removed").map((item) => item.path);
}

/** specs/<slug>/promoted.json: a spec whose hidden suite is now the repository's own regression tests. */
export const promotedOf = (slug) => readJson(join(SPECS, slug, "promoted.json"), null);

/**
 * The implementing session's transcript for a repository: the newest under
 * TRANSCRIPTS in the project folder of the repository or of a folder above
 * it, where Claude Code keeps sessions started there.
 */
export function newestTranscript(repo) {
  const folders = [];
  for (let at = repo; ; at = dirname(at)) {
    folders.push(join(TRANSCRIPTS, at.replace(/[^a-zA-Z0-9]/g, "-")));
    if (dirname(at) === at) break;
  }
  const found = folders
    .filter((folder) => existsSync(folder))
    .flatMap((folder) =>
      readdirSync(folder)
        .filter((name) => name.endsWith(".jsonl"))
        .map((name) => join(folder, name)),
    )
    .map((path) => ({ path, mtime: lstatSync(path).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return found[0]?.path ?? null;
}

/**
 * Attempts by an implementing session that ran this skill itself to read
 * what it was told never to open: the spec's hidden suite, reference,
 * calibration and grades, the hidden dir in a judge tree, or a recursive
 * search over the skill's specs/ or runs/. Only tool calls at or after
 * `since` (an ISO time) count. What a call reaches is its Bash command with
 * heredoc bodies taken out, or an edit's file path: code that mentions
 * calibration.json is not a read of it.
 */
export function audit(transcript, chain, since) {
  const slug = chain.slug;
  const names = [
    `${slug}/tests/private`,
    `${slug}/reference`,
    "calibration.json",
    "grade.json",
    basename(chain.hiddenDir),
    JUDGE_ROOT,
  ];
  const sweep = (input) =>
    /\b(grep|rg|find|ls|tree|cat|head|tail)\b[^|;&]*(-[a-zA-Z]*[rR]\b|\*\*|find\b)/.test(reach({ name: "Bash", input })) &&
    /(^|[\s/])(specs|runs)(\/|\s|$)/.test(reach({ name: "Bash", input }));
  const searchedOver = (input) =>
    typeof input.path === "string" &&
    [ROOT, HOME, SPECS, join(SPECS, slug), RUNS].map(comparable).includes(comparable(input.path).replace(/\/$/, ""));
  const reach = (block) => {
    const input = block.input ?? {};
    if (block.name === "Bash") return (input.command ?? "").replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?\n\2(?=\s|$)/g, "");
    if (["Edit", "Write", "NotebookEdit"].includes(block.name)) return input.file_path ?? input.notebook_path ?? "";
    return JSON.stringify(input);
  };
  return scanTranscript(transcript, since, (block) => {
    const input = block.input ?? {};
    const text = comparable(reach(block));
    const hit = names.find((name) => text.includes(comparable(name)));
    if (hit !== undefined) return hit;
    if (block.name === "Bash" && sweep(input)) return "a recursive search over specs/ or runs/";
    if ((block.name === "Grep" || block.name === "Glob") && searchedOver(input)) return `a search over ${input.path}`;
    return null;
  });
}

/** Tool calls of a transcript that `match` names, each with the match, its time and its input's start. */
function scanTranscript(transcript, since, match) {
  if (!existsSync(transcript)) return [];
  const found = [];
  for (const line of readFileSync(transcript, "utf8").split("\n")) {
    if (!line.includes('"tool_use"')) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    // A line with no time in a timed transcript is a copy (a request blob), not a call.
    if (since !== undefined && (typeof event.timestamp !== "string" || event.timestamp < since)) continue;
    for (const block of event.message?.content ?? []) {
      if (block.type !== "tool_use") continue;
      const hit = match(block);
      if (hit !== null)
        found.push({ tool: block.name, match: hit, at: event.timestamp ?? null, input: JSON.stringify(block.input ?? {}).slice(0, 300) });
    }
  }
  return found;
}

/**
 * Tool calls in a transcript that reached, or tried to reach, anything the
 * session was not given: the package or PRIVATE, the transcripts, another
 * workdir, or any of `names` (an agent run passes `tests/private`).
 */
export function peeks(transcript, own, names = []) {
  if (!existsSync(transcript)) return [];
  // Compared as `comparable` has them: on Windows a path may come as C:\, C:/ or /c/.
  const patterns = [...PRIVATE, TRANSCRIPTS, ".claude/projects", ...names].map(comparable);
  const work = comparable(WORK_ROOT);
  const mine = comparable(own);
  // The session's own project folder, where the CLI keeps a long tool
  // output and tells the session to read it back: its own, not a peek.
  const ownProject = comparable(join(TRANSCRIPTS, own.replace(/[^a-zA-Z0-9]/g, "-")));
  const found = [];
  for (const line of readFileSync(transcript, "utf8").split("\n")) {
    if (!line.includes('"tool_use"')) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    for (const block of event.message?.content ?? []) {
      if (block.type !== "tool_use") continue;
      const input = comparable(JSON.stringify(block.input ?? {})).replaceAll(`${ownProject}/`, "");
      // A tail that does not start with "/" is a path beside WORK_ROOT, not
      // under it.
      const outside = input
        .split(work)
        .slice(1)
        .some((tail) => tail.startsWith("/") && !`${work}${tail}`.startsWith(mine));
      const hit = patterns.find((pattern) => input.includes(pattern));
      if (hit !== undefined || outside)
        found.push({ tool: block.name, match: hit ?? "another workdir", input: input.slice(0, 300) });
    }
  }
  return found;
}

/** Removes a workdir, which lives under WORK_ROOT. */
export function discard(dir) {
  if (!dir.startsWith(`${WORK_ROOT}${sep}`)) throw new Error(`Not a workdir: ${dir}`);

  rmSync(dir, { recursive: true, force: true });
}
