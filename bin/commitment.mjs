// The commitment hash: one sha256 over a spec's hidden suite as the judge
// uses it, so a graded party can check the suite was fixed before they
// submitted. bin/prepare.mjs records it in prepared.json, bin/handout.mjs
// shows it in BRIEF.md and handout.json, bin/judge.mjs recomputes it and
// refuses on a mismatch, bin/promote.mjs prints it at reveal, and a seal
// (bin/seal.mjs) carries it in seal.json.
//
// What is hashed, from a folder laid out as specs/<slug>/ (or an unpacked
// seal): a manifest of lines in `sha256sum` format, `<hex>  <path>\n`,
//   - one per file under tests/private/, every depth, `.DS_Store` skipped,
//     sorted by the UTF-8 bytes of the path: the hex the sha256 of its
//     bytes, the path `tests/private/<rel>` with `/` separators;
//   - then one line for the kept test ids: the hex the sha256 of
//     JSON.stringify(calibration.kept sorted) (UTF-8), the path
//     `calibration.kept`;
//   - only for a spec at a black-box seam, a last line for what the suites
//     call (toolchain.json `boundary`: the command, or the service's start,
//     healthcheck and build), since changing it changes what the hidden
//     suite tests: the hex the sha256 of its JSON with keys sorted at every
//     level, the path `toolchain.boundary`. A spec without one hashes as
//     before.
// hiddenSha256 is the sha256 of the manifest's UTF-8 bytes, lowercase hex.
// By hand:
//   (cd specs/<slug> && find tests/private -type f ! -name .DS_Store | LC_ALL=C sort | xargs shasum -a 256
//    && printf '%s  calibration.kept\n' "$(jq -cj '.kept | sort' calibration.json | shasum -a 256 | cut -c1-64)"
//    && printf '%s  toolchain.boundary\n' "$(jq -cjS '.boundary' toolchain.json | shasum -a 256 | cut -c1-64)") | shasum -a 256
// (the last printf only when toolchain.json has a boundary)
// (jq sorts by code point and JS by UTF-16 unit; the two agree unless an id
// holds characters beyond the BMP.)
//
// Specs prepared before the hash existed have no commitment in
// prepared.json. Their first handout records one there (`hiddenRecordedBy:
// "handout"`), still before any submission; one with no prepared.json at
// all (an import) gets none, and its judge prints the hash it computed
// without checking it. A repository handout's own handout.json is checked
// too, so a change after the handout is refused even then.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { listFiles, readJson, specDir, writeJson } from "./lib.mjs";

const sha = (data) => createHash("sha256").update(data).digest("hex");
const byBytes = (a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path));
/** A JSON value with every object's keys sorted, as `jq -S` writes it. */
const sorted = (value) =>
  Array.isArray(value)
    ? value.map(sorted)
    : value !== null && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]))
      : value;

/** The manifest hiddenSha256 is the hash of (see above). */
export function hiddenManifest(dir, kept = readJson(join(dir, "calibration.json"), {}).kept ?? []) {
  const hidden = join(dir, "tests", "private");
  const lines = listFiles(hidden, [])
    .filter((rel) => rel.split(sep).at(-1) !== ".DS_Store")
    .map((rel) => ({ path: `tests/private/${rel.split(sep).join("/")}`, hex: sha(readFileSync(join(hidden, rel))) }));
  lines.sort(byBytes).push({ path: "calibration.kept", hex: sha(JSON.stringify([...kept].sort())) });
  const boundary = readJson(join(dir, "toolchain.json"), {}).boundary;
  if (boundary !== undefined) lines.push({ path: "toolchain.boundary", hex: sha(JSON.stringify(sorted(boundary))) });
  return lines.map((line) => `${line.hex}  ${line.path}\n`).join("");
}

/** The commitment hash of the hidden suite in `dir` (specs/<slug>/ or an unpacked seal). */
export const hiddenSha256 = (dir, kept) => sha(hiddenManifest(dir, kept));

/**
 * The spec's recorded commitment against its hidden suite now: `ok` false
 * only when one is recorded and differs. `at` is when it was recorded.
 */
export function commitment(slug) {
  const prepared = readJson(join(specDir(slug), "prepared.json"), null);
  const current = hiddenSha256(specDir(slug));
  const recorded = prepared?.hiddenSha256 ?? null;
  return { current, recorded, at: prepared?.hiddenAt ?? null, ok: recorded === null || recorded === current, prepared };
}

/** Records the current hash in prepared.json, keeping its other fields. */
export function recordCommitment(slug, by) {
  const path = join(specDir(slug), "prepared.json");
  const prepared = readJson(path, {});
  const value = { hiddenSha256: hiddenSha256(specDir(slug)), hiddenAt: new Date().toISOString(), ...(by ? { hiddenRecordedBy: by } : {}) };
  const { hiddenRecordedBy, ...rest } = prepared;
  writeJson(path, { ...rest, ...value });
  return value;
}

/** The line judge and promote print with a verdict. */
export const commitmentLine = ({ current, recorded, at }) =>
  recorded === null
    ? `Hidden suite sha256 ${current} (no commitment recorded for this spec; nothing to check it against).`
    : `Hidden suite sha256 ${current}, committed ${at}.`;
