#!/usr/bin/env node
// Whether a package of an existing repository can be a target (SKILL.md,
// step 0). Reads the repository at a commit, never its working tree: the
// lockfile and package manager, the workspaces, the runner (vitest, Jest,
// or node:test over a tsconfig.test.json build), TypeScript and the Node
// engine; or, for a Python package (pyproject.toml, setup.py or setup.cfg
// and no package.json), pytest, a tests folder and a frozen install
// (uv.lock, poetry.lock, requirements*.txt). Then, unless --no-run, stages that commit with its dependencies
// installed (lib.mjs `prepareBase`, kept for bin/repo.mjs), runs the
// package's existing suite once on a clone and records pass, fail and
// duration. Tests that fail there (network, services) are a count, not a
// reason to refuse: they become the baseline's known failures.
//
//   node bin/fit.mjs --repo <path> [--package <dir>] [--base <ref>] [--no-run]
//     [--seam exec --command "<argv>" | --seam http --start "<cmd>" [--healthcheck <path>]] [--boundary-build "<cmd>"]
//
// --seam exec|http asks whether the package can be checked at a black-box
// boundary instead of its exports: a command the suites run (split on
// spaces into an argv; the suites add their arguments) or a service the
// judge starts per suite (lib.mjs `boundaryOf`, bin/runners/boundary.mjs).
// It runs the boundary once on the staged base, in the package's folder,
// after --boundary-build: the service must answer its healthcheck (any
// status) within its timeout; the command must start (exit 127 or a spawn
// error is "not found"). `config.boundary` is what bin/repo.mjs records.
//
// Prints `supported` or `unsupported: <reason>`, then the findings as JSON.
// Exit 0 supported, 2 unsupported, 1 the check itself failed.

import { spawnSync } from "node:child_process";
import { join, posix, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  PACKAGE_MANAGERS,
  RUNNERS,
  args,
  discard,
  log,
  prepareBase,
  repoChain,
  runSuite,
  stage,
  testsOf,
  workdir,
} from "./lib.mjs";

/** A suite longer than this is too slow to run several times per spec. */
export const MAX_SUITE_MINUTES = 10;
const LOCKFILES = [
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"],
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
];
const TEST_FILE = /\.(test|spec)\.[cm]?tsx?$/;

const git = (repo, ...argv) =>
  spawnSync("git", ["-C", repo, ...argv], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

/** One commit of a repository, read through git: its files and their text. */
export function reader(repo, ref = "HEAD") {
  const top = git(repo, "rev-parse", "--show-toplevel");
  if (top.status !== 0) throw new Error(`${repo} is not inside a git repository`);
  const root = top.stdout.trim();
  const sha = git(root, "rev-parse", "--verify", `${ref}^{commit}`);
  if (sha.status !== 0) throw new Error(`${root}: no commit ${ref}`);
  const base = sha.stdout.trim();
  const files = git(root, "ls-tree", "-r", "--name-only", "-z", base).stdout.split("\0").filter(Boolean);
  const set = new Set(files);
  const text = (path) => (set.has(path) ? git(root, "show", `${base}:${path}`).stdout : null);
  const json = (path) => {
    const body = text(path);
    if (body === null) return null;
    try {
      return JSON.parse(body);
    } catch {
      // tsconfig files take comments and trailing commas.
      return JSON.parse(body.replace(/\/\*[\s\S]*?\*\/|(^|[^:"])\/\/.*$/gm, "$1").replace(/,(\s*[}\]])/g, "$1"));
    }
  };
  return { root, base, files, has: (path) => set.has(path), text, json };
}

/** Workspace folders from package.json `workspaces` or pnpm-workspace.yaml, `dir/*` and `dir/**` expanded. */
function workspaces(tree) {
  const root = tree.json("package.json") ?? {};
  let globs = Array.isArray(root.workspaces) ? root.workspaces : (root.workspaces?.packages ?? []);
  const pnpm = tree.text("pnpm-workspace.yaml");
  if (pnpm !== null)
    globs = [...globs, ...[...pnpm.matchAll(/^\s*-\s*["']?([^"'\n]+?)["']?\s*$/gm)].map((match) => match[1])];
  const folders = new Set(
    tree.files.filter((path) => path.endsWith("/package.json")).map((path) => posix.dirname(path)),
  );
  const matches = (glob, folder) =>
    new RegExp(`^${glob.replace(/\/\*\*$/, "/.+").replace(/\/\*$/, "/[^/]+")}$`).test(folder);
  const out = new Map();
  for (const folder of folders) {
    if (folder.split("/").includes("node_modules")) continue;
    const included = globs.some((glob) => !glob.startsWith("!") && matches(glob, folder));
    const excluded = globs.some((glob) => glob.startsWith("!") && matches(glob.slice(1), folder));
    if (included && !excluded) out.set(tree.json(`${folder}/package.json`)?.name, folder);
  }
  out.delete(undefined);
  return out;
}

/**
 * The workspace folders the package depends on, transitively, in build
 * order (dependencies first): the ones whose dist/ the package imports.
 */
function buildOrder(tree, pkg, byName) {
  const order = [];
  const seen = new Set();
  const visit = (folder) => {
    if (seen.has(folder)) return;
    seen.add(folder);
    const manifest = tree.json(`${folder === "." ? "" : `${folder}/`}package.json`) ?? {};
    const deps = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies };
    for (const name of Object.keys(deps)) if (byName.has(name)) visit(byName.get(name));
    if (folder !== pkg) order.push(folder);
  };
  visit(pkg);
  return order;
}

/** The common folder of a glob's literal leading segments: `test/**\/*.test.ts` is `test`. */
const globRoot = (glob) => {
  const parts = glob.replace(/^\.\//, "").split("/");
  const literal = parts.slice(0, parts.findIndex((part) => /[*?{[]/.test(part)));
  return literal.join("/");
};

/**
 * What the repository at `ref` offers for a package: either
 * `{ supported: true, config }`, where `config` is the toolchain.json
 * fields bin/repo.mjs starts from, or `{ supported: false, reason }`.
 * `facts` is everything found, for either.
 */
export function detect({ repo, pkg = ".", ref = "HEAD" }) {
  const tree = reader(resolve(repo), ref);
  const at = (path) => (pkg === "." ? path : `${pkg}/${path}`);
  const facts = { repo: tree.root, base: tree.base, package: pkg };
  const no = (reason) => ({ supported: false, reason, facts });

  const manifest = tree.json(at("package.json"));
  if (manifest === null && PYTHON_PROJECT.some((file) => tree.has(at(file)))) return detectPython(tree, pkg, facts, no);
  if (manifest === null) return no(`no ${at("package.json")} at ${tree.base.slice(0, 12)}`);
  const rootManifest = tree.json("package.json") ?? {};
  const lock = LOCKFILES.find(([file]) => tree.has(file));
  if (lock === undefined) return no("no lockfile at the repository root; the install must be frozen");
  const [lockfile, manager] = lock;
  const declared = /^([a-z]+)@([^+\s]+)/.exec(rootManifest.packageManager ?? "");
  facts.lockfile = lockfile;
  facts.packageManager = declared?.[1] === manager ? `${manager}@${declared[2]}` : manager;
  if (!PACKAGE_MANAGERS.includes(manager)) return no(`package manager ${manager} is not supported`);
  if (tree.has(".pnp.cjs") || /nodeLinker:\s*["']?pnp/.test(tree.text(".yarnrc.yml") ?? ""))
    return no("Yarn Plug'n'Play: no node_modules to stage");

  const byName = workspaces(tree);
  facts.workspaces = [...byName.values()].sort();
  if (pkg !== "." && !facts.workspaces.includes(pkg) && facts.workspaces.length > 0)
    return no(`${pkg} is not one of the workspaces: ${facts.workspaces.join(", ")}`);
  // Only folders with a build: the rest have nothing git does not hold.
  facts.buildFirst = buildOrder(tree, pkg, byName).filter(
    (folder) => tree.json(`${folder}/package.json`)?.scripts?.build !== undefined,
  );

  const deps = { ...rootManifest.devDependencies, ...rootManifest.dependencies, ...manifest.devDependencies, ...manifest.dependencies };
  facts.typescript = deps.typescript ?? null;
  if (facts.typescript === null || !tree.has(at("tsconfig.json")))
    return no(`no TypeScript: ${facts.typescript === null ? "no typescript dependency" : `no ${at("tsconfig.json")}`}`);
  facts.engine = manifest.engines?.node ?? rootManifest.engines?.node ?? null;
  facts.node = process.version;

  const testScript = manifest.scripts?.test ?? "";
  facts.testScript = testScript || null;
  const vitestConfig = ["vitest", "vite"]
    .flatMap((name) => ["ts", "mts", "js", "mjs", "cts", "cjs"].map((ext) => at(`${name}.config.${ext}`)))
    .find((path) => tree.has(path));
  const usesVitest =
    deps.vitest !== undefined && (/\bvitest\b/.test(testScript) || /vitest\.config/.test(vitestConfig ?? ""));
  const usesNodeTest = /\bnode\b[^&|;]*--test\b/.test(testScript) && tree.has(at("tsconfig.test.json"));
  const jestConfig = ["ts", "mts", "js", "mjs", "cts", "cjs", "json"].map((ext) => at(`jest.config.${ext}`)).find((path) => tree.has(path));
  const usesJest =
    deps.jest !== undefined && (/\bjest\b/.test(testScript) || jestConfig !== undefined || manifest.jest !== undefined);
  const config = {
    name: "repo",
    repo: tree.root,
    base: tree.base,
    package: pkg,
    packageManager: facts.packageManager,
    buildFirst: facts.buildFirst,
  };
  const packageTests = tree.files.filter((path) => path.startsWith(at("")) && TEST_FILE.test(path) && !path.includes("node_modules/"));
  const firstWithTests = (folders) => folders.find((folder) => packageTests.some((path) => path.startsWith(`${at(folder)}/`)));
  /** `*.test.ts`, `*.test.tsx` or `*.test.{ts,tsx}`, by the files the folder holds (`spec` where it has no `test`). */
  const patternIn = (folder) => {
    const names = packageTests.filter((path) => path.startsWith(`${at(folder)}/`));
    const kind = names.some((path) => /\.test\./.test(path)) || names.length === 0 ? "test" : "spec";
    const exts = [...new Set(names.map((path) => new RegExp(`\\.${kind}\\.(\\w+)$`).exec(path)?.[1]).filter(Boolean))].sort();
    return exts.length > 1 ? `*.${kind}.{${exts.join(",")}}` : `*.${kind}.${exts[0] ?? "ts"}`;
  };

  if (usesVitest) {
    config.runner = "vitest";
    const source = vitestConfig === undefined ? "" : tree.text(vitestConfig);
    const include = /include\s*:\s*\[([^\]]*)\]/.exec(source)?.[1];
    const globs = include === undefined ? [] : [...include.matchAll(/["'`]([^"'`]+)["'`]/g)].map((match) => match[1]);
    facts.vitestInclude = globs.length > 0 ? globs : null;
    const folder = globs.length > 0 ? globRoot(globs[0]) : firstWithTests(["test", "tests", "src"]);
    if (folder === undefined || folder === "") return no("no test folder: vitest's include names none, and no test/, tests/ or src/ holds tests");
    config.testDir = at(folder);
    config.testPattern = patternIn(folder);
    // vitest does not type-check; the build is the package's own check.
    config.build = `tsc -p ${tree.has(at("tsconfig.test.json")) ? "tsconfig.test.json" : "tsconfig.json"} --noEmit`;
  } else if (usesNodeTest) {
    config.runner = "node-test";
    const tsconfig = tree.json(at("tsconfig.test.json"));
    const options = tsconfig?.compilerOptions ?? {};
    const parent = typeof tsconfig?.extends === "string" && tsconfig.extends.startsWith(".") ? tree.json(at(posix.normalize(tsconfig.extends))) : null;
    config.rootDir = options.rootDir ?? parent?.compilerOptions?.rootDir ?? ".";
    config.outDir = options.outDir ?? parent?.compilerOptions?.outDir;
    if (config.outDir === undefined) return no(`${at("tsconfig.test.json")} names no outDir; node --test runs its compiled output`);
    const folder = firstWithTests(["test", "tests", "src"]);
    if (folder === undefined) return no("no test files under test/, tests/ or src/");
    config.testDir = at(folder);
    config.testPattern = patternIn(folder);
    config.build = "tsc -p tsconfig.test.json";
  } else if (usesJest) {
    config.runner = "jest";
    facts.jestConfig = jestConfig ?? (manifest.jest !== undefined ? `${at("package.json")} "jest"` : null);
    const folder = firstWithTests(["test", "tests", "__tests__", "src"]);
    if (folder === undefined) return no("no test files under test/, tests/, __tests__/ or src/");
    config.testDir = at(folder);
    config.testPattern = patternIn(folder);
    // Jest's transform may not type-check; the build is the package's own
    // check, over the tsconfig its tests compile with where it has one.
    const tsconfig = ["tsconfig.test.json", "tsconfig.spec.json", "tsconfig.json"].find((name) => tree.has(at(name)));
    config.build = `tsc -p ${tsconfig} --noEmit`;
  } else {
    return no(`runner outside vitest, Jest and node:test over tsconfig.test.json: scripts.test is ${JSON.stringify(testScript || null)}`);
  }
  return { supported: true, config, facts };
}

/** The names under pyproject.toml's `[dependency-groups]`. */
const dependencyGroups = (pyproject) => {
  const section = /^\[dependency-groups\]\s*\n([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(pyproject)?.[1] ?? "";
  return [...section.matchAll(/^([A-Za-z0-9_.-]+)\s*=/gm)].map((match) => match[1]);
};
/** What marks a Python project. */
const PYTHON_PROJECT = ["pyproject.toml", "setup.py", "setup.cfg"];
const PYTHON_TEST_FILE = /(^|\/)test_[^/]*\.py$/;

/**
 * A Python package for pytest: a pytest configuration (pytest.ini,
 * `[tool.pytest.ini_options]` in pyproject.toml, `[tool:pytest]` in
 * setup.cfg, `[pytest]` in tox.ini) or pytest among its declared
 * dependencies, a tests folder of `test_*.py` files, and a frozen install:
 * uv.lock, poetry.lock, or requirements*.txt (pip). Sources under `src/`
 * (a src layout) go first on the suites' path.
 */
function detectPython(tree, pkg, facts, no) {
  const at = (path) => (pkg === "." ? path : `${pkg}/${path}`);
  const pyproject = tree.text(at("pyproject.toml")) ?? "";
  const setupCfg = tree.text(at("setup.cfg")) ?? "";
  const requirements = tree.files
    .filter((path) => posix.dirname(path) === (pkg === "." ? "." : pkg) && /^requirements[^/]*\.txt$/.test(posix.basename(path)))
    .sort();
  const declared = [pyproject, setupCfg, ...requirements.map((path) => tree.text(path) ?? "")].some((text) => /\bpytest\b/.test(text));
  facts.language = "python";
  facts.pytestConfig = tree.has(at("pytest.ini"))
    ? at("pytest.ini")
    : /^\[tool\.pytest\.ini_options\]/m.test(pyproject)
      ? `${at("pyproject.toml")} [tool.pytest.ini_options]`
      : /^\[tool:pytest\]/m.test(setupCfg)
        ? `${at("setup.cfg")} [tool:pytest]`
        : /^\[pytest\]/m.test(tree.text(at("tox.ini")) ?? "")
          ? `${at("tox.ini")} [pytest]`
          : null;
  if (facts.pytestConfig === null && !declared) return no("no pytest: no pytest configuration and pytest is not a declared dependency");
  const lock = [
    ["uv.lock", "uv"],
    ["poetry.lock", "poetry"],
  ].find(([file]) => tree.has(at(file)));
  facts.lockfile = lock?.[0] ?? (requirements.length > 0 ? requirements.join(", ") : null);
  if (facts.lockfile === null) return no("no lockfile: uv.lock, poetry.lock or requirements*.txt; the install must be frozen");
  facts.packageManager = lock?.[1] ?? "pip";
  const packageTests = tree.files.filter((path) => path.startsWith(at("")) && PYTHON_TEST_FILE.test(path));
  const folder = ["tests", "test", "src"].find((name) => packageTests.some((path) => path.startsWith(`${at(name)}/`)));
  if (folder === undefined) return no("no test_*.py files under tests/, test/ or src/");
  const srcLayout = tree.files.some((path) => new RegExp(`^${at("src/")}[^/]+/__init__\\.py$`).test(path));
  const config = {
    name: "repo",
    repo: tree.root,
    base: tree.base,
    package: pkg,
    packageManager: facts.packageManager,
    buildFirst: [],
    runner: "pytest",
    testDir: at(folder),
    testPattern: "test_*.py",
    pythonPath: [srcLayout ? "src" : "."],
    ...(facts.packageManager === "pip" ? { requirements } : {}),
    ...(facts.packageManager === "uv" ? { groups: dependencyGroups(pyproject).filter((name) => /^(dev|tests?|testing)$/.test(name)) } : {}),
  };
  return { supported: true, config, facts };
}

/** The package's existing suite once, on a clone of the prepared base tree: counts and duration. */
export function runExisting(config) {
  prepareBase(config);
  const chain = repoChain(config, null);
  const dir = stage(workdir("fit"), null, { chain, spec: false });
  const started = Date.now();
  try {
    const result = runSuite(dir, "existing", chain);
    const tests = testsOf(result);
    return {
      compiled: result.compiled,
      compileOutput: result.compileOutput || undefined,
      files: result.files.length,
      crashed: result.files.filter((file) => file.crashed).map((file) => file.file),
      passed: tests.filter((test) => test.ok).length,
      failed: tests.filter((test) => !test.ok).map((test) => test.id),
      seconds: Math.round((Date.now() - started) / 1000),
    };
  } finally {
    discard(dir);
  }
}

/**
 * The boundary --seam names, as toolchain.json `boundary` holds it, or
 * null without --seam; throws on a --seam without its command or start.
 */
export function boundaryOption(options) {
  if (options.seam !== "exec" && options.seam !== "http") return null;
  const build = typeof options["boundary-build"] === "string" ? { build: options["boundary-build"] } : {};
  if (options.seam === "exec") {
    if (typeof options.command !== "string") throw new Error("--seam exec needs --command \"<argv>\"");
    return { command: options.command.split(/\s+/).filter(Boolean), ...build };
  }
  if (typeof options.start !== "string") throw new Error("--seam http needs --start \"<command>\"");
  return { service: { start: options.start, healthcheck: typeof options.healthcheck === "string" ? options.healthcheck : "/" }, ...build };
}

/**
 * The boundary once on a clone of the prepared base, in the package's
 * folder, under bin/runners/boundary.mjs: whether the service answered or
 * the command started, and how long it took.
 */
export function runBoundary(config) {
  prepareBase(config);
  const chain = repoChain(config, null);
  const dir = stage(workdir("fit-boundary"), null, { chain, spec: false });
  const probe = config.boundary.service !== undefined
    ? `fetch(new URL(${JSON.stringify(config.boundary.service.healthcheck ?? "/")}, process.env.BOUNDARY_URL)).then((res) => console.log(JSON.stringify({ ready: true, status: res.status })), () => console.log(JSON.stringify({ ready: false })))`
    : `const [bin, ...argv] = JSON.parse(process.env.BOUNDARY_COMMAND); const run = require("node:child_process").spawnSync(bin, argv, { input: "", encoding: "utf8", timeout: 60000 }); console.log(JSON.stringify({ ready: run.error === undefined && run.status !== 127, exit: run.status, error: run.error?.code }))`;
  const started = Date.now();
  try {
    const run = spawnSync(process.execPath, [join(RUNNERS, "boundary.mjs"), JSON.stringify(config.boundary), "--", process.execPath, "-e", probe], {
      cwd: join(dir, config.package),
      encoding: "utf8",
    });
    const line = run.stdout.trim().split("\n").at(-1) ?? "";
    const found = line.startsWith("{") ? JSON.parse(line) : { ready: false };
    return { ...found, seconds: Math.round((Date.now() - started) / 100) / 10, ...(found.ready ? {} : { output: run.stderr.trim().slice(-2000) }) };
  } finally {
    discard(dir);
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { options } = args();
  if (typeof options.repo !== "string") {
    console.error('usage: node bin/fit.mjs --repo <path> [--package <dir>] [--base <ref>] [--no-run] [--seam exec --command "<argv>" | --seam http --start "<cmd>" [--healthcheck <path>]] [--boundary-build "<cmd>"]');
    process.exit(1);
  }
  let found;
  try {
    const boundary = boundaryOption(options);
    found = detect({ repo: options.repo, pkg: options.package ?? ".", ref: options.base ?? "HEAD" });
    if (found.supported && boundary !== null) found.config.boundary = boundary;
    if (found.supported && options["no-run"] !== true) {
      log(`${found.config.package}: staging ${found.config.base.slice(0, 12)} and running its existing suite`);
      found.suite = runExisting(found.config);
      // ts-jest type-checks each test file itself: a project-wide tsc that
      // fails on a clean install is no check to keep.
      if (!found.suite.compiled && found.config.runner === "jest" && found.config.build !== undefined) {
        found.facts.buildDropped = `${found.config.build}: ${found.suite.compileOutput?.split("\n")[0] ?? ""}`;
        delete found.config.build;
        found.suite = runExisting(found.config);
      }
      if (!found.suite.compiled) {
        found.supported = false;
        found.reason = `the existing suite does not build on a clean install: ${found.suite.compileOutput?.split("\n")[0] ?? ""}`;
      } else if (found.suite.seconds > MAX_SUITE_MINUTES * 60) {
        found.supported = false;
        found.reason = `the existing suite takes ${Math.round(found.suite.seconds / 60)} minutes, over ${MAX_SUITE_MINUTES}`;
      }
      if (found.supported && boundary !== null) {
        found.facts.boundary = runBoundary(found.config);
        if (!found.facts.boundary.ready) {
          found.supported = false;
          found.reason =
            boundary.service !== undefined
              ? `the service did not answer ${boundary.service.healthcheck} on the staged base`
              : `the command ${boundary.command.join(" ")} did not start on the staged base`;
        }
      }
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log(found.supported ? "supported" : `unsupported: ${found.reason}`);
  if (found.suite !== undefined)
    console.log(
      `existing suite: ${found.suite.passed} passed, ${found.suite.failed.length} failed, ${found.suite.crashed.length} file(s) crashed, ${found.suite.seconds} s`,
    );
  console.log(JSON.stringify({ ...found.facts, config: found.config, suite: found.suite }, null, 2));
  process.exit(found.supported ? 0 : 2);
}
