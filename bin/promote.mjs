#!/usr/bin/env node
// After a repository target is judged `passed` (SKILL.md, step 5): copies
// the hidden suite into the checkout beside the public one, as the
// repository's own regression tests, and marks the spec promoted in
// specs/<slug>/promoted.json. From then on bin/judge.mjs and
// bin/handout.mjs refuse the spec: a suite in the repository judges
// nothing as hidden.
//
// Each hidden file lands in publicDir as `<slug>.regression.<name>`, its
// relative imports rewritten for the new folder. Refused unless
// runs/<slug>/judged.json says `passed` for this checkout's working tree
// as it is now, or when a target file exists. Nothing is committed.
// At the reveal it prints the hidden suite's commitment hash
// (bin/commitment.mjs), so the graded party can check it against the one
// their handout showed, and refuses if the suite changed since the judge.
//
//   node bin/promote.mjs <slug>

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { commitment, commitmentLine } from "./commitment.mjs";
import {
  RUNS,
  args,
  checkoutChanges,
  listFiles,
  promotedOf,
  readJson,
  sha256,
  specDir,
  toolchainOf,
  writeJson,
} from "./lib.mjs";

const { rest } = args();
const [slug] = rest;
if (slug === undefined) {
  console.error("usage: node bin/promote.mjs <slug>");
  process.exit(1);
}
const fail = (message) => {
  console.error(`${slug}: ${message}`);
  process.exit(1);
};
const chain = toolchainOf(slug);
if (chain.name !== "repo") fail("not a repository target");
if (promotedOf(slug) !== null) fail(`already promoted on ${promotedOf(slug).at}`);
const judged = readJson(join(RUNS, slug, "judged.json"), null);
if (judged?.verdict !== "passed") fail(`last judged ${judged?.verdict ?? "never"}; promote only after node bin/judge.mjs ${slug} --repo says passed`);
if (judged.ref !== null) fail(`judged at ${judged.ref}, not a working tree; judge the checkout to promote into`);
const found = checkoutChanges(chain, judged.checkout);
const now = sha256(JSON.stringify(found.items.map((item) => [item.path, item.change, sha256(found.content(item.path) ?? "")])));
if (now !== judged.changesSha256) fail(`${judged.checkout} changed since it was judged at ${judged.at}; judge it again`);
const committed = commitment(slug);
if (!committed.ok || (judged.hiddenSha256 !== undefined && judged.hiddenSha256 !== committed.current))
  fail(`hidden suite changed since it was judged at ${judged.at} (sha256 now ${committed.current}); judge it again`);

const hidden = join(specDir(slug), "tests", "private");
/** A relative import from the hidden dir, re-pointed from publicDir. */
const repoint = (text, from, to) =>
  text.replace(/(from\s+|import\s*\(\s*|import\s+)(["'])(\.[^"']+)\2/g, (whole, lead, quote, specifier) => {
    const target = posix.normalize(posix.join(from, specifier));
    const moved = posix.relative(to, target);
    return `${lead}${quote}${moved.startsWith(".") ? moved : `./${moved}`}${quote}`;
  });
const files = listFiles(hidden).map((name) => {
  const flat = name.replaceAll("/", "-");
  const bare = flat.startsWith(`${slug}.`) ? flat.slice(slug.length + 1) : flat;
  return { name, path: posix.join(chain.publicDir, `${slug}.regression.${bare}`) };
});
const taken = files.filter((file) => existsSync(join(judged.checkout, file.path)));
if (taken.length > 0) fail(`refused: ${taken.map((file) => file.path).join(", ")} exist`);
for (const file of files) {
  const from = posix.dirname(posix.join(chain.hiddenDir, file.name));
  writeFileSync(join(judged.checkout, file.path), repoint(readFileSync(join(hidden, file.name), "utf8"), from, chain.publicDir));
}
writeJson(join(specDir(slug), "promoted.json"), {
  at: new Date().toISOString(),
  checkout: judged.checkout,
  judgedAt: judged.at,
  files: files.map((file) => file.path),
  hiddenSha256: committed.current,
});
console.log(`${slug}: ${files.length} hidden file(s) copied into ${judged.checkout} as regression tests (uncommitted):`);
for (const file of files) console.log(`- ${file.path}`);
console.log(commitmentLine(committed));
console.log(`Run the package's suite once (${chain.test}) and commit them with the change.`);
