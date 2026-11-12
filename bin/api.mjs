// The library entry, `duediligence/api`: the rules and prompts without the
// session runner, for a platform that runs its own agent loop and evaluator.
// Every export is a pure function of its arguments, apart from the hash and
// promptPath reading the files they are pointed at (a spec folder, the
// package's prompts/). Importing it spawns no process, reads no home folder
// (DUEDILIGENCE_HOME, HOME) and touches no network: it imports nothing that
// does (bin/lib.mjs, whose top level seeds a home, least of all).
// test/api.mjs holds it to that.
//
//   decisionItems(specText)                 the `Decided:` items with their Ticket/Instead/Scenarios fields
//   scenarios(specText)                     the Gherkin scenarios keyed `kind-n`: { key, title, body }
//   diffDecisions(before, after)            { kept, edited, added, removed } between two lists of decision texts
//   hiddenManifest(dirOrFiles, kept?)       the commitment manifest of a spec folder or a file map
//   hiddenSha256(dirOrFiles, kept?)         its sha256: what prepared.json, handouts and seals record
//   calibrate({ skeleton, reference })      the hidden-test filter: { status, reason, hiddenWritten, kept, dropped }
//   verdict(outcomes)                       passed | overfit | incomplete | regressed | refused, with counts and failing scenario keys
//   promptPath(name)                        the absolute path of prompts/<name>.md; anything outside prompts/ refused
//   renderPrompt(name, values)              prompts/<name>.md with each {{key}} filled from values, as the CLI fills repo/ briefs
//
// prompts/sandbox/ holds briefs only a platform renders: hidden tests for a
// generated project whose cut modules are recording mocks (sandbox-factory).
//
// Suite results are what a runner prints (bin/runners/shared.mjs); the
// rules' inputs and outputs are documented in bin/rules.mjs, the hash's in
// bin/hash.mjs.

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export { decisionItems, diffDecisions, scenarios } from "./decisions.mjs";
export { hiddenManifest, hiddenSha256 } from "./hash.mjs";
export { calibration as calibrate, judgement as verdict } from "./rules.mjs";

const PROMPTS = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts");

/**
 * The absolute path of a brief under prompts/: `name` is relative with `/`,
 * with or without `.md` ("spec-from-ticket", "skeleton.md", "repo/hidden-tests").
 * Throws on an absolute path, `.` or `..` segments, a backslash, a path that
 * resolves outside prompts/ (through a symlink too) or a file that is not there.
 */
export function promptPath(name) {
  const refuse = (why) => {
    throw new Error(`promptPath(${JSON.stringify(name)}): ${why}`);
  };
  if (typeof name !== "string" || name === "") refuse("a prompt name is a non-empty string");
  if (name.includes("\0") || name.includes("\\") || isAbsolute(name) || /^[a-zA-Z]:/.test(name))
    refuse("not a relative path under prompts/");
  const parts = name.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) refuse("not a relative path under prompts/");
  const path = join(PROMPTS, ...parts.slice(0, -1), parts.at(-1).endsWith(".md") ? parts.at(-1) : `${parts.at(-1)}.md`);
  if (!existsSync(path) || !statSync(path).isFile()) refuse("no such prompt");
  const within = relative(realpathSync(PROMPTS), realpathSync(path));
  if (within === "" || within.startsWith(`..${sep}`) || within === ".." || isAbsolute(within)) refuse("outside prompts/");
  return path;
}

/**
 * The brief at prompts/`name` (as `promptPath` takes it) with each
 * `{{key}}` replaced by `values[key]`, the way the CLI fills the repository
 * briefs from a spec's toolchain.json (bin/lib.mjs `render`), for a
 * platform that fills them from its own project. Throws when a placeholder
 * has no value or a value is not a string, so a brief that gains a
 * placeholder fails loudly at the version that adds it rather than reaching
 * a model with `{{key}}` in it.
 */
export function renderPrompt(name, values) {
  const path = promptPath(name);
  if (values === null || typeof values !== "object") throw new Error(`renderPrompt(${JSON.stringify(name)}): values is an object`);
  return readFileSync(path, "utf8").replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!Object.hasOwn(values, key)) throw new Error(`renderPrompt(${JSON.stringify(name)}): no value for {{${key}}}`);
    if (typeof values[key] !== "string") throw new Error(`renderPrompt(${JSON.stringify(name)}): {{${key}}} is not a string`);
    return values[key];
  });
}
