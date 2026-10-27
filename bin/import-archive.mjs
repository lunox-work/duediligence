#!/usr/bin/env node
// Brings a calibrated spec from the experiment archive
// (experiments/specs/<slug>/) into SPECS in this layout, so
// `judge`, `run`, `grade` and `handout` take it as they take a prepared
// spec. Copied: spec.md, ticket.md, problem.json, skeleton/, tests/public/,
// tests/private/, reference/, start/, calibration.json, generation.json.
// Not copied: the gap writer's tests/private-blind/ and
// calibration-blind.json, notes.md, runs and grades.
//
// toolchain.json is translated: `name` kept (no file for node); `prompts`
// kept for pyfunc (HumanEval+), set to `lcb` for a LiveCodeBench problem
// (the archive's python prompts, prompts/lcb/ here). The archive's
// `generate` and `reference` fields, which steered its own generation,
// move to imported.json.
//
// An imported spec is not held out: its suites sat in the archive's working
// folder, read by the people and sessions that worked there, and were
// published with its write-ups. imported.json says so (`heldOut: false`)
// and records no commitment: there is no prepared.json, so no hiddenSha256
// was ever recorded before a submission (bin/commitment.mjs); judge prints
// the hash it computes and checks it against nothing, and prepare refuses
// the spec without --force. Never copy archive folders by hand: the layouts
// differ in these small ways.
//
//   node bin/import-archive.mjs <slug>... [--archive <dir>] [--force]
//   node bin/import-archive.mjs <slug> --seam exec [--as <new slug>] [--archive <dir>] [--force]
//
// --archive defaults to INDEPENDENT_TESTS_ARCHIVE, then
// experiments/ in this package. Exit 1 if any slug was
// not imported.
//
// --seam exec brings a node spec in at a command boundary instead of its
// module (toolchain `exec`, as <slug>-cli unless --as): every export of
// its skeleton becomes a call to `node src/cli.js <export>`, which reads
// the JSON array of arguments on stdin and prints the JSON of the result,
// or a thrown error's message on stderr with exit 1. Scripted, no model:
// - each suite gets `boundary.ts`, the skeleton's types with every function
//   body replaced by that call through BOUNDARY_COMMAND (child_process), and
//   its tests import from it instead of src/index.js, so no test reaches
//   the code but through the command; test ids are unchanged; a non-zero
//   exit throws an Error with the command's stderr as its message, as the
//   module would have thrown it (the stub's "not implemented" included);
// - the skeleton gains src/cli.ts, which exits 2 (src/index.ts stays, as
//   the interface the implementer may use), the reference a src/cli.ts
//   that dispatches to its exports;
// - spec.md gains an "Interface: a command" section saying so.
// Only skeletons whose exports are plain functions over JSON values (no
// class, async, callback, binary or Map/Set/Date type) convert. The
// archive's calibration.json comes along as it was, for the module seam:
// recalibrate before trusting the counts (evidence/seams.mjs does, with
// the archive's reference and no session).

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { ROOT, SPECS, args, copy, ensureTemplate, listFiles, log, readJson, specDir, writeJson } from "./lib.mjs";

const COPIED = ["spec.md", "ticket.md", "problem.json", "skeleton", "tests/public", "tests/private", "reference", "start", "calibration.json", "generation.json"];

const { options, rest } = args();
const archive = resolve(
  typeof options.archive === "string" ? options.archive : (process.env.INDEPENDENT_TESTS_ARCHIVE ?? join(ROOT, "experiments")),
);
if (rest.length === 0) {
  console.error("usage: node bin/import-archive.mjs <slug>... [--archive <dir>] [--force]");
  process.exit(1);
}
if (!existsSync(join(archive, "specs"))) {
  console.error(`${archive} has no specs/; pass --archive <archive folder>.`);
  process.exit(1);
}

/** The archive's toolchain.json as this layout reads it, or null for the node default. */
function toolchainOf(from) {
  const config = readJson(join(from, "toolchain.json"), {});
  const { name = "node", prompts, generate, reference, ...other } = config;
  const out = { name, ...other };
  if (name === "python") out.prompts = prompts ?? "lcb";
  else if (prompts !== undefined) out.prompts = prompts;
  return { toolchain: name === "node" && Object.keys(out).length === 1 ? null : out, steering: { generate, reference } };
}

const seam = options.seam ?? null;
if (seam !== null && (seam !== "exec" || rest.length !== 1)) {
  console.error("--seam takes `exec` and one slug: node bin/import-archive.mjs <slug> --seam exec [--as <new slug>]");
  process.exit(1);
}

/** The command a converted spec's suites call, and what it reads and prints. */
const COMMAND = ["node", "src/cli.js"];
const CLI_STUB = `// The command the suites call: node src/cli.js <export>, the JSON array of
// arguments on stdin, the JSON of the result on stdout (spec.md, "Interface:
// a command"). Not implemented yet.
process.stderr.write("not implemented\\n");
process.exitCode = 2;
`;
const CLI_DISPATCH = `// The command the suites call: node src/cli.js <export>, the JSON array of
// arguments on stdin, the JSON of what the export returns on stdout; an
// error's message on stderr and exit 1. Generated by bin/import-archive.mjs
// --seam exec over the module's exports.
import { readFileSync } from "node:fs";
import * as api from "./index.js";

const name = process.argv[2];
const fn = (api as Record<string, unknown>)[name];
if (typeof fn !== "function") {
  process.stderr.write(\`no export \${name}\\n\`);
  process.exitCode = 2;
} else {
  try {
    const value = (fn as (...args: unknown[]) => unknown)(...JSON.parse(readFileSync(0, "utf8")));
    process.stdout.write(value === undefined ? "" : JSON.stringify(value));
  } catch (error) {
    process.stderr.write(String((error as Error)?.message ?? error));
    process.exitCode = 1;
  }
}
`;
const BOUNDARY_HEAD = `// Generated by bin/import-archive.mjs --seam exec: the interface of
// src/index.ts with every function a call to the command the suite is run
// against (BOUNDARY_COMMAND, a JSON argv, set by sandbox/boundary.mjs and
// sandbox.env). Tests import the code under test from here, never from src/.
import { spawnSync } from "node:child_process";

function call(name: string, args: unknown[]): any {
  const command: string[] = JSON.parse(process.env.BOUNDARY_COMMAND ?? "[]");
  if (command.length === 0) throw new Error("BOUNDARY_COMMAND is not set: run the suite with sandbox.env or through sandbox/boundary.mjs");
  const run = spawnSync(command[0], [...command.slice(1), name], {
    input: JSON.stringify(args),
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (run.error !== undefined) throw run.error;
  if (run.status === 0) return run.stdout === "" ? undefined : JSON.parse(run.stdout);
  // As the module would throw: the message the command wrote, the stub's "not implemented" included.
  throw new Error(run.stderr.replace(/\\n$/, "") || \`\${command.join(" ")} \${name}: exit \${run.status ?? run.signal}\`);
}
`;
const SPEC_SECTION = (names) => `
## Interface: a command

The code is checked only through one command, run from the project's root:
\`node src/cli.js <name>\`, where \`<name>\` is one of ${names.map((name) => `\`${name}\``).join(", ")}.
It reads a JSON array of the arguments on stdin and writes the JSON of the
result on stdout, exit 0. Where the spec says a call fails with an error, it
writes the error's message, and nothing else, on stderr and exits 1. \`src/index.ts\` describes
each name's arguments and result as TypeScript types; the tests call the
command, never the module. A value the spec writes as \`undefined\` is no
output at all.
`;

/**
 * The skeleton's exports as calls to the command: its text with each
 * exported function's body replaced, or a reason it cannot convert.
 */
function boundaryModule(skeleton) {
  const ts = createRequire(join(ensureTemplate(), "package.json"))("typescript");
  const file = ts.createSourceFile("index.ts", skeleton, ts.ScriptTarget.ES2022, true);
  const exported = (node) => node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword);
  const BINARY = /\b(Promise|Uint8Array|ArrayBuffer|Buffer|Map|Set|WeakMap|Date|RegExp|bigint)\b|=>/;
  const edits = [];
  const names = [];
  for (const node of file.statements) {
    if (!exported(node)) continue;
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      if (BINARY.test(node.getText(file))) return { reason: `type ${node.name.text} holds a value JSON cannot carry` };
      continue;
    }
    if (!ts.isFunctionDeclaration(node) || node.body === undefined)
      return { reason: `exports ${ts.SyntaxKind[node.kind]} ${node.name?.getText() ?? ""}: only plain functions convert` };
    if (node.modifiers.some((mod) => mod.kind === ts.SyntaxKind.AsyncKeyword)) return { reason: `${node.name.text} is async` };
    const signature = skeleton.slice(node.parameters.pos, node.body.pos);
    if (BINARY.test(signature)) return { reason: `${node.name.text} takes or returns a value JSON cannot carry: ${signature.trim()}` };
    if (node.parameters.some((param) => !ts.isIdentifier(param.name) || param.dotDotDotToken))
      return { reason: `${node.name.text} has a destructured or rest parameter` };
    names.push(node.name.text);
    edits.push({
      start: node.body.getStart(file),
      end: node.body.end,
      text: `{\n  return call(${JSON.stringify(node.name.text)}, [${node.parameters.map((param) => param.name.text).join(", ")}]);\n}`,
    });
  }
  if (names.length === 0) return { reason: "exports no function" };
  let text = skeleton;
  for (const edit of edits.sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return { text: `${BOUNDARY_HEAD}\n${text}`, names };
}

/** Converts an imported node spec in `to` to the command seam; returns a reason it could not, or null. */
function toCommand(to) {
  const skeletonPath = join(to, "skeleton", "src", "index.ts");
  if (!existsSync(skeletonPath)) return "no skeleton/src/index.ts (only node specs convert)";
  const converted = boundaryModule(readFileSync(skeletonPath, "utf8"));
  if (converted.reason) return converted.reason;
  for (const suite of ["public", "private"]) {
    const dir = join(to, "tests", suite);
    writeFileSync(join(dir, "boundary.ts"), converted.text);
    for (const rel of listFiles(dir).filter((path) => path.endsWith(".test.ts"))) {
      const path = join(dir, rel);
      const shim = relative(dirname(path), join(dir, "boundary.js"));
      const text = readFileSync(path, "utf8").replace(/(["'])(?:\.\.\/)+src\/index\.js\1/g, (_, quote) => `${quote}${shim.startsWith(".") ? shim : `./${shim}`}${quote}`);
      if (/src\/index/.test(text)) return `${suite}/${rel} still names src/index after the rewrite`;
      writeFileSync(path, text);
    }
  }
  writeFileSync(join(to, "skeleton", "src", "cli.ts"), CLI_STUB);
  if (existsSync(join(to, "reference", "src"))) writeFileSync(join(to, "reference", "src", "cli.ts"), CLI_DISPATCH);
  writeFileSync(join(to, "spec.md"), `${readFileSync(join(to, "spec.md"), "utf8").trimEnd()}\n${SPEC_SECTION(converted.names)}`);
  writeJson(join(to, "toolchain.json"), { name: "exec", boundary: { command: COMMAND } });
  return null;
}

let failed = 0;
for (const slug of rest) {
  const from = join(archive, "specs", slug);
  const name = seam === null ? slug : typeof options.as === "string" ? options.as : `${slug}-cli`;
  const to = specDir(name);
  const skip = (why) => {
    failed += 1;
    console.log(`${slug}: not imported: ${why}.`);
  };
  if (!existsSync(join(from, "spec.md"))) {
    skip(`no ${join(from, "spec.md")}`);
    continue;
  }
  const calibration = readJson(join(from, "calibration.json"), null);
  if (calibration?.status !== "ok") {
    skip(`its calibration.json is ${calibration === null ? "missing" : `"${calibration.status}"`}`);
    continue;
  }
  if (!existsSync(join(from, "tests", "private"))) {
    skip("no tests/private/");
    continue;
  }
  if (existsSync(to) && options.force !== true) {
    skip(`${to} exists; pass --force to replace it`);
    continue;
  }
  rmSync(to, { recursive: true, force: true });
  const files = [];
  for (const part of COPIED)
    if (existsSync(join(from, part))) {
      copy(join(from, part), join(to, part));
      files.push(part);
    }
  const { toolchain, steering } = toolchainOf(from);
  if (toolchain !== null) writeJson(join(to, "toolchain.json"), toolchain);
  if (seam !== null) {
    const why = toolchain !== null ? `its toolchain is ${toolchain.name}, not node` : toCommand(to);
    if (why !== null) {
      rmSync(to, { recursive: true, force: true });
      skip(`not convertible to a command: ${why}`);
      continue;
    }
  }
  writeJson(join(to, "imported.json"), {
    from,
    at: new Date().toISOString(),
    heldOut: false,
    why: "Its suites were in the archive's working folder and its published write-ups before this import; anyone who worked there may have read them.",
    commitment: null,
    commitmentNote: "No prepared.json, so no hiddenSha256 was recorded before any submission; judge prints the hash it computes and checks nothing.",
    archiveToolchain: steering,
    files,
    ...(seam === null
      ? {}
      : {
          seam,
          seamNote: "Converted to a command boundary by --seam exec: boundary.ts in each suite, src/cli.ts in skeleton and reference, an Interface section in spec.md. calibration.json is the archive's, for the module seam; recalibrate.",
        }),
  });
  log(`${name}: imported (${calibration.kept.length} hidden tests kept, ${calibration.publicIds.length} public; not held out${seam === null ? "" : "; at a command boundary"})`);
}
const imported = rest.length - failed;
console.log(`${imported} spec(s) imported into ${SPECS}${failed > 0 ? `, ${failed} not` : ""}.`);
if (imported > 0)
  console.log("Imported specs are not held out: use them to check the pipeline, never to grade a party that could have seen the archive.");
process.exit(failed === 0 ? 0 : 1);
