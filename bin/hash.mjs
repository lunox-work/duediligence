// The commitment hash: one sha256 over a spec's hidden suite as the judge
// uses it, so a graded party can check the suite was fixed before they
// submitted. bin/prepare.mjs records it in prepared.json, bin/handout.mjs
// shows it in BRIEF.md and handout.json, bin/judge.mjs recomputes it and
// refuses on a mismatch, bin/promote.mjs prints it at reveal, and a seal
// (bin/seal.mjs) carries it in seal.json. bin/commitment.mjs records and
// checks it per spec; this module only computes it, from a folder or from
// files in memory, and reads nothing else (no DUEDILIGENCE_HOME, no HOME).
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

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const sha = (data) => createHash("sha256").update(data).digest("hex");
const byBytes = (a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path));
/** A JSON value with every object's keys sorted, as `jq -S` writes it. */
const sorted = (value) =>
  Array.isArray(value)
    ? value.map(sorted)
    : value !== null && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]))
      : value;

/** Every file under `dir`, relative with `/`, sorted; none when it does not exist. */
function filesUnder(dir) {
  const out = [];
  const walk = (at, rel) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(join(at, entry.name), path);
      else out.push(path);
    }
  };
  if (existsSync(dir)) walk(dir, "");
  return out.sort();
}

/**
 * The spec as hashed: its hidden files (`tests/private/<rel>` → bytes),
 * calibration.json and toolchain.json parsed (or undefined), from a folder
 * or from a file map of the same layout: a Map or object keyed by paths
 * relative to the spec folder with `/`, each a string (UTF-8) or bytes.
 */
function specOf(source) {
  if (typeof source === "string") {
    const json = (name) => (existsSync(join(source, name)) ? JSON.parse(readFileSync(join(source, name), "utf8")) : undefined);
    const hidden = join(source, "tests", "private");
    return {
      hidden: filesUnder(hidden).map((rel) => ({ rel, bytes: () => readFileSync(join(hidden, ...rel.split("/"))) })),
      calibration: json("calibration.json"),
      toolchain: json("toolchain.json"),
    };
  }
  if (source === null || typeof source !== "object")
    throw new TypeError("hiddenManifest: pass a spec folder or a file map ({ 'tests/private/<file>': contents, ... })");
  const entries = source instanceof Map ? [...source.entries()] : Object.entries(source);
  const text = (value) => (typeof value === "string" ? value : Buffer.from(value).toString("utf8"));
  const json = (name) => {
    const found = entries.find(([path]) => path === name);
    return found === undefined ? undefined : JSON.parse(text(found[1]));
  };
  return {
    hidden: entries
      .filter(([path]) => path.startsWith("tests/private/"))
      .map(([path, value]) => ({ rel: path.slice("tests/private/".length), bytes: () => value })),
    calibration: json("calibration.json"),
    toolchain: json("toolchain.json"),
  };
}

/**
 * The manifest hiddenSha256 is the hash of (see above), from a spec folder
 * or a file map. `kept` defaults to calibration.json's.
 */
export function hiddenManifest(source, kept) {
  const spec = specOf(source);
  const ids = kept ?? spec.calibration?.kept ?? [];
  const lines = spec.hidden
    .filter((file) => file.rel.split("/").at(-1) !== ".DS_Store")
    .map((file) => ({ path: `tests/private/${file.rel}`, hex: sha(file.bytes()) }));
  lines.sort(byBytes).push({ path: "calibration.kept", hex: sha(JSON.stringify([...ids].sort())) });
  const boundary = spec.toolchain?.boundary;
  if (boundary !== undefined) lines.push({ path: "toolchain.boundary", hex: sha(JSON.stringify(sorted(boundary))) });
  return lines.map((line) => `${line.hex}  ${line.path}\n`).join("");
}

/** The commitment hash of the hidden suite in a spec folder (specs/<slug>/ or an unpacked seal) or a file map. */
export const hiddenSha256 = (source, kept) => sha(hiddenManifest(source, kept));
