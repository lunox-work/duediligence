#!/usr/bin/env node
// The skill's gate between a spec and its tests (SKILL.md, step 2). A spec
// drafted from a ticket decides what the ticket leaves open, and on four of
// seven tickets it decided otherwise than the person who wrote the precise
// spec (FINDINGS.md, "From the ticket alone"). So bin/prepare.mjs generates
// no suite from a spec.md a person has not confirmed. A confirmation is
// specs/<slug>/confirmed.json: the hash of spec.md, who confirmed it, and
// the `Decided:` items they were shown. Any later edit to spec.md voids it.
//
//   node bin/confirm.mjs <slug>              the decisions, and whether spec.md is confirmed
//   node bin/confirm.mjs <slug> --by <name>  record that <name> confirmed spec.md as it stands

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { args, readJson, sha256, specDir, writeJson } from "./lib.mjs";

/**
 * The items under the last `Decided:` heading of a spec
 * (prompts/spec-from-ticket.md ends every drafted spec with one), or none.
 */
export function decisions(text) {
  const headings = [...text.matchAll(/^\W*decided:?\W*$/gim)];
  if (headings.length === 0) return [];
  const last = headings.at(-1);
  const items = [];
  for (const raw of text.slice(last.index + last[0].length).split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    const item = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (item) items.push(item[1].trim());
    else if (items.length > 0) items[items.length - 1] += ` ${line}`;
    else break;
  }
  return items;
}

/** Whether specs/<slug>/spec.md as it stands is the one a person confirmed, and if not, why. */
export function confirmation(slug) {
  const specPath = join(specDir(slug), "spec.md");
  if (!existsSync(specPath)) return { ok: false, reason: `no ${specPath}` };
  const hash = sha256(readFileSync(specPath));
  const record = readJson(join(specDir(slug), "confirmed.json"), null);
  if (record === null) return { ok: false, hash, reason: "spec.md has never been confirmed" };
  if (record.sha256 !== hash)
    return { ok: false, hash, reason: `spec.md changed after ${record.by} confirmed it on ${record.at}` };
  return { ok: true, hash, record };
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { options, rest } = args();
  const [slug] = rest;
  if (slug === undefined) {
    console.error("usage: node bin/confirm.mjs <slug> [--by <name>]");
    process.exit(1);
  }
  const specPath = join(specDir(slug), "spec.md");
  if (!existsSync(specPath)) {
    console.error(`No ${specPath}.`);
    process.exit(1);
  }
  const decided = decisions(readFileSync(specPath, "utf8"));
  if (typeof options.by === "string" && options.by.trim() !== "") {
    writeJson(join(specDir(slug), "confirmed.json"), {
      sha256: sha256(readFileSync(specPath)),
      by: options.by.trim(),
      at: new Date().toISOString(),
      decided,
    });
    console.log(`${slug}: spec.md confirmed by ${options.by.trim()}, ${decided.length} decision(s).`);
  } else {
    const state = confirmation(slug);
    console.log(state.ok ? `${slug}: confirmed by ${state.record.by} on ${state.record.at}.` : `${slug}: not confirmed: ${state.reason}.`);
    console.log(decided.length === 0 ? "No `Decided:` list in spec.md." : `Decided:\n${decided.map((item) => `- ${item}`).join("\n")}`);
    process.exit(state.ok ? 0 : 3);
  }
}
