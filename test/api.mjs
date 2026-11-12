#!/usr/bin/env node
// The library entry, `duediligence/api` (bin/api.mjs), imported by package
// self-reference the way a platform imports it, with HOME and
// DUEDILIGENCE_HOME unset, every child_process function trapped, the
// network trapped, and every fs call recorded: importing it and calling
// each export must spawn nothing, connect nowhere, write nothing and read
// only the package and the folder this test made. Then each export on
// known inputs, the hash against values computed before it moved out of
// bin/commitment.mjs.
//
//   node test/api.mjs

import assert from "node:assert/strict";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = realpathSync(join(dirname(fileURLToPath(import.meta.url)), ".."));
const SPEC = join(ROOT, "specs", "duration-parse");
const step = (name, fn) => {
  fn();
  console.log(`ok ${name}`);
};

// Fixtures first, before anything is trapped: the bundled spec's text and a
// black-box spec folder (nested files, .DS_Store at two depths, a boundary).
const specText = readFileSync(join(SPEC, "spec.md"), "utf8");
const scratch = realpathSync(mkdtempSync(join(tmpdir(), "duediligence-api-")));
const boundaryFiles = {
  "tests/private/b.test.ts": "b\n",
  "tests/private/Z.test.ts": "Z",
  "tests/private/sub/c.test.ts": "nested é\n",
  "tests/private/.DS_Store": "x",
  "tests/private/sub/.DS_Store": "x",
  "calibration.json": '{"kept":["z :: 2","a :: 1"]}\n',
  "toolchain.json": '{"name":"exec","boundary":{"start":"node x.js","command":["a",{"z":1,"b":[{"y":2,"c":3}]}]}}\n',
};
const boundaryDir = join(scratch, "boundary");
for (const [path, text] of Object.entries(boundaryFiles)) {
  mkdirSync(dirname(join(boundaryDir, path)), { recursive: true });
  writeFileSync(join(boundaryDir, path), text);
}
const specFiles = {};
for (const name of ["parse.test.ts", "format.test.ts"])
  specFiles[`tests/private/${name}`] = readFileSync(join(SPEC, "tests", "private", name));
specFiles["calibration.json"] = readFileSync(join(SPEC, "calibration.json"));

// The traps.
delete process.env.HOME;
delete process.env.DUEDILIGENCE_HOME;
delete process.env.DUEDILIGENCE_SPECS;
delete process.env.DUEDILIGENCE_RESULTS;
delete process.env.DUEDILIGENCE_WORK;
const trapped = [];
const trap = (module, names, label) => {
  for (const name of names)
    if (typeof module[name] === "function")
      module[name] = () => {
        trapped.push(`${label}.${name}`);
        throw new Error(`${label}.${name} called from duediligence/api`);
      };
};
trap(require("node:child_process"), ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"], "child_process");
trap(require("node:net"), ["connect", "createConnection", "createServer"], "net");
trap(require("node:tls"), ["connect"], "tls");
for (const name of ["http", "https", "http2"]) trap(require(`node:${name}`), ["request", "get", "connect", "createServer"], name);
trap(require("node:dns"), ["lookup", "resolve"], "dns");
globalThis.fetch = () => {
  trapped.push("fetch");
  throw new Error("fetch called from duediligence/api");
};
const fs = require("node:fs");
const removeScratch = fs.rmSync.bind(fs, scratch, { recursive: true, force: true });
const touched = [];
const WRITES = ["writeFileSync", "appendFileSync", "mkdirSync", "mkdtempSync", "rmSync", "rmdirSync", "unlinkSync", "renameSync", "cpSync", "copyFileSync", "symlinkSync", "writeFile", "mkdir", "rm"];
const READS = ["readFileSync", "readdirSync", "existsSync", "statSync", "lstatSync", "realpathSync", "accessSync", "readFile", "readdir", "stat", "openSync", "open"];
// open is a write only with a writing flag (readFileSync opens with "r").
const writing = (name, argv) => WRITES.includes(name) || (name.startsWith("open") && /[wa+]/.test(String(argv[1] ?? "r")));
for (const name of [...WRITES, ...READS]) {
  const original = fs[name];
  const wrapped = function (...argv) {
    const at = argv[0] instanceof URL || String(argv[0]).startsWith("file:") ? fileURLToPath(argv[0]) : String(argv[0]);
    touched.push({ name, path: at });
    if (writing(name, argv)) throw new Error(`fs.${name} called from duediligence/api`);
    return original.apply(this, argv);
  };
  if (original.native) wrapped.native = original.native;
  fs[name] = wrapped;
}
syncBuiltinESMExports();

let api;
try {
  api = await import("duediligence/api");
  step("import duediligence/api by self-reference: nothing spawned, written or read outside the package", () => {
    assert.deepEqual(trapped, []);
    assert.deepEqual(touched.filter(({ path }) => !path.startsWith(ROOT + sep)), []);
    // The module loader reads through fs too: the whole import graph, without bin/lib.mjs.
    const loaded = [...new Set(touched.filter(({ path }) => path.endsWith(".mjs")).map(({ path }) => path.slice(ROOT.length + 1).split(sep).join("/")))].sort();
    assert.deepEqual(loaded, ["bin/api.mjs", "bin/decisions.mjs", "bin/hash.mjs", "bin/rules.mjs"]);
    assert.deepEqual(
      Object.keys(api).sort(),
      ["calibrate", "decisionItems", "diffDecisions", "hiddenManifest", "hiddenSha256", "promptPath", "renderPrompt", "scenarios", "verdict"],
    );
    // "." stays the CLI (resolved, not imported: importing it runs it).
    assert.equal(import.meta.resolve("duediligence"), new URL("../bin/cli.mjs", import.meta.url).href);
  });

  step("decisionItems and scenarios on the bundled spec", () => {
    const items = api.decisionItems(specText);
    assert.ok(items.length > 0 && items.every((item) => typeof item.text === "string" && item.text.length > 0));
    const keyed = api.scenarios(specText);
    assert.ok(keyed.length > 0);
    assert.ok(keyed.every((s) => /^[\w-]+-\d+$/.test(s.key) && typeof s.title === "string"));
    assert.equal(new Set(keyed.map((s) => s.key)).size, keyed.length);
    const tiny = "Decided:\n- Units are lowercase only: `3S` is invalid.\n  Ticket: silent.\n  Instead: accept any case.\n  Scenarios: unhappy-1\n";
    assert.deepEqual(api.decisionItems(tiny), [
      { text: "Units are lowercase only: `3S` is invalid.", ticket: "silent.", instead: "accept any case.", scenarios: "unhappy-1" },
    ]);
  });

  step("diffDecisions", () => {
    const diff = api.diffDecisions(
      ["Units are lowercase only", "Negative durations are rejected", "Whitespace is trimmed"],
      ["Units are lowercase only", "Negative durations are rejected with a RangeError", "Empty input returns zero"],
    );
    assert.equal(diff.kept, 1);
    assert.deepEqual(diff.edited, [{ from: "Negative durations are rejected", to: "Negative durations are rejected with a RangeError" }]);
    assert.deepEqual(diff.added, ["Empty input returns zero"]);
    assert.deepEqual(diff.removed, ["Whitespace is trimmed"]);
  });

  step("hiddenSha256: folder and file map, byte-identical to bin/commitment.mjs before the split", () => {
    // Pinned with the pre-split bin/commitment.mjs (f828cb7) on the same inputs.
    assert.equal(api.hiddenSha256(SPEC), "011e72943df09a8b6b55f073b426559193a17e82ed1fd338f9bc1c62b0a02f3a");
    assert.equal(api.hiddenSha256(specFiles), "011e72943df09a8b6b55f073b426559193a17e82ed1fd338f9bc1c62b0a02f3a");
    assert.equal(api.hiddenSha256(SPEC, ["b", "a"]), "af688358e86885d1267b64e687b27ae30f620f71e5f59b39c5f5132aa7d7fe1b");
    const pinned = "2cdd6b1d234cc196c327a0818a99b4426fb86c77b9219db32523aa7076a9155b";
    assert.equal(api.hiddenSha256(boundaryDir), pinned);
    assert.equal(api.hiddenSha256(boundaryFiles), pinned);
    assert.equal(api.hiddenSha256(new Map(Object.entries(boundaryFiles).map(([path, text]) => [path, Buffer.from(text)]))), pinned);
    assert.equal(
      api.hiddenManifest(boundaryFiles),
      [
        "bbeebd879e1dff6918546dc0c179fdde505f2a21591c9a9c96e36b054ec5af83  tests/private/Z.test.ts",
        "0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f  tests/private/b.test.ts",
        "291777d275b6e0f3a9d740714dc9df605dbdf3e3fb82e1d4e53dd1241081faa0  tests/private/sub/c.test.ts",
        "9930a5ae46cc963bb48e00770718761a3c975bc12351f5d1794e9f9029e50346  calibration.kept",
        "6af1e1f6cb90bbe660e6d3707b48fb199516c19f1a3bf7632d1132eaf0418b3d  toolchain.boundary",
        "",
      ].join("\n"),
    );
    assert.notEqual(api.hiddenSha256({ ...boundaryFiles, "tests/private/b.test.ts": "b!\n" }), pinned);
  });

  const suite = (files) => ({ compiled: true, compileOutput: "", files });
  const test = (name, ok, extra = {}) => ({ name, ok, skipped: false, ...extra });

  step("calibrate", () => {
    const skeleton = suite([
      { file: "tests/private/a.test.ts", crashed: false, tests: [test("[happy-1] parses", false), test("[happy-2] trivially passes", true), test("[edge-1] skipped", false, { skipped: true })] },
      { file: "tests/private/b.test.ts", crashed: false, tests: [test("[unhappy-1] rejects", false), test("[unhappy-2] reference fails", false)] },
      { file: "tests/private/c.test.ts", crashed: true, tests: [] },
    ]);
    const reference = suite([
      { file: "tests/private/a.test.ts", crashed: false, tests: [test("[happy-1] parses", true), test("[happy-2] trivially passes", true), test("[edge-1] skipped", true)] },
      { file: "tests/private/b.test.ts", crashed: false, tests: [test("[unhappy-1] rejects", true), test("[unhappy-2] reference fails", false, { error: { message: "expected 3\nmore" } })] },
    ]);
    const result = api.calibrate({ skeleton, reference });
    assert.equal(result.status, "ok");
    assert.equal(result.reason, null);
    assert.equal(result.hiddenWritten, 5);
    assert.deepEqual(result.kept, ["tests/private/a.test.ts :: [happy-1] parses", "tests/private/b.test.ts :: [unhappy-1] rejects"]);
    assert.deepEqual(result.dropped, [
      { id: "tests/private/c.test.ts :: *", reason: "The file crashes on the skeleton instead of failing a test." },
      { id: "tests/private/a.test.ts :: [happy-2] trivially passes", reason: "Passes on the skeleton." },
      { id: "tests/private/a.test.ts :: [edge-1] skipped", reason: "Skipped." },
      { id: "tests/private/b.test.ts :: [unhappy-2] reference fails", reason: "The reference cannot satisfy it: expected 3" },
    ]);
    const none = api.calibrate({ skeleton, reference: null });
    assert.equal(none.status, "dropped");
    assert.equal(none.reason, "No hidden test survived calibration.");
    assert.deepEqual(none.kept, []);
    const broken = api.calibrate({ skeleton: { compiled: false, compileOutput: "TS2304", files: [] }, reference });
    assert.equal(broken.status, "dropped");
    assert.equal(broken.reason, "The hidden suite does not compile against the skeleton.");
    assert.equal(broken.compileOutput, "TS2304");
  });

  step("verdict", () => {
    const publicIds = ["tests/public/p.test.ts :: [happy-1] one", "tests/public/p.test.ts :: [happy-2] two"];
    const kept = ["tests/private/h.test.ts :: [happy-1] a", "tests/private/h.test.ts :: [unhappy-1] b", "tests/private/h.test.ts :: [unhappy-2] c"];
    const pub = (ok) => suite([{ file: "tests/public/p.test.ts", tests: [test("[happy-1] one", true), test("[happy-2] two", ok)] }]);
    const hid = (...oks) => suite([{ file: "tests/private/h.test.ts", tests: ["[happy-1] a", "[unhappy-1] b", "[unhappy-2] c"].map((name, at) => test(name, oks[at], oks[at] ? {} : { error: { message: `bad ${at}` } })) }]);
    const passed = api.verdict({ public: pub(true), hidden: hid(true, true, true), publicIds, kept });
    assert.equal(passed.verdict, "passed");
    assert.deepEqual(passed.hidden, { passed: 3, total: 3 });
    assert.deepEqual(passed.failedScenarios, []);
    const overfit = api.verdict({ public: pub(true), hidden: hid(true, false, false), publicIds, kept });
    assert.equal(overfit.verdict, "overfit");
    assert.deepEqual(overfit.failedScenarios, ["unhappy-1", "unhappy-2"]);
    assert.deepEqual(overfit.failures, [
      { id: kept[1], message: "bad 1" },
      { id: kept[2], message: "bad 2" },
    ]);
    const incomplete = api.verdict({ public: pub(false), hidden: hid(true, true, true), publicIds, kept });
    assert.equal(incomplete.verdict, "incomplete");
    assert.deepEqual(incomplete.publicFailing, [publicIds[1]]);
    const before = suite([{ file: "test/x.test.ts", tests: [test("keeps", true), test("was red", false)] }]);
    const after = suite([{ file: "test/x.test.ts", tests: [test("keeps", false), test("was red", false)] }]);
    const regressed = api.verdict({ public: pub(true), hidden: hid(true, true, true), publicIds, kept, existing: after, baseline: before });
    assert.equal(regressed.verdict, "regressed");
    assert.deepEqual(regressed.regressions, ["test/x.test.ts :: keeps"]);
    assert.deepEqual(regressed.existing, { passed: 0, total: 1 });
    assert.equal(api.verdict({ public: pub(true), hidden: hid(true, true, true), publicIds, kept, existing: after, baseline: { passing: [] } }).verdict, "passed");
    const harness = { path: "package.json", change: "changed", reason: "harness" };
    const refused = api.verdict({ publicIds, kept, refused: [harness] });
    assert.equal(refused.verdict, "refused");
    assert.deepEqual(refused.public, { passed: 0, total: 2 });
    const scope = { publicIds, kept, public: pub(true), hidden: hid(true, true, true), changed: ["src/a.ts", { path: "README.md", change: "changed" }], allowedPaths: ["src/"] };
    const loose = api.verdict(scope);
    assert.equal(loose.verdict, "passed");
    assert.deepEqual(loose.outsideScope, [{ path: "README.md", change: "changed" }]);
    const strict = api.verdict({ ...scope, strictScope: true });
    assert.equal(strict.verdict, "refused");
    assert.deepEqual(strict.refused, [{ path: "README.md", change: "changed" }]);
  });

  step("promptPath", () => {
    for (const name of ["spec-from-ticket.md", "skeleton", "public-tests.md", "hidden-tests", "reference.md", "repo/skeleton", "repo/hidden-tests.md"]) {
      const path = api.promptPath(name);
      assert.ok(path.startsWith(join(ROOT, "prompts") + sep), path);
      assert.ok(readFileSync(path, "utf8").length > 0);
    }
    for (const name of ["../package.json", "../README", "repo/../../bin/api.mjs", "/etc/passwd", "repo\\skeleton", "./skeleton", "repo//skeleton", "", "nope", "repo", "C:/x", "a\0b", 42])
      assert.throws(() => api.promptPath(name), /promptPath/, `accepted ${JSON.stringify(name)}`);
  });

  step("renderPrompt", () => {
    const values = {
      seam: "`src/a.ts`",
      publicDir: "tests/public",
      slug: "x",
      hiddenDir: "tests/private",
      allowedPaths: "`src/`",
      testPublic: "npm run test:public",
      testHidden: "npm run test:private",
      test: "npm test",
    };
    const text = api.renderPrompt("repo/reference", values);
    assert.doesNotMatch(text, /\{\{/);
    assert.match(text, /The interface is at `src\/a\.ts`\./);
    assert.match(text, /`tests\/public\/x\.\*` and `tests\/private\/`/);
    // A brief with no placeholders comes back as it is.
    assert.equal(api.renderPrompt("reference", {}), readFileSync(api.promptPath("reference"), "utf8"));
    const { seam, ...missing } = values;
    assert.throws(() => api.renderPrompt("repo/reference", missing), /no value for \{\{seam\}\}/);
    assert.throws(() => api.renderPrompt("repo/reference", { ...values, seam: 1 }), /\{\{seam\}\} is not a string/);
    assert.throws(() => api.renderPrompt("repo/reference", null), /values is an object/);
    assert.throws(() => api.renderPrompt("../package.json", values), /promptPath/);
  });

  step("nothing spawned, connected, written, or read outside the package and this test's folder", () => {
    assert.deepEqual(trapped, []);
    const outside = touched.filter(({ path }) => !(path.startsWith(ROOT + sep) || path === ROOT || path.startsWith(scratch + sep)));
    assert.deepEqual(outside, []);
    assert.ok(touched.some(({ path }) => path.startsWith(join(ROOT, "prompts"))), "the fs recorder saw nothing");
  });
  console.log("api passed");
} finally {
  removeScratch();
}
