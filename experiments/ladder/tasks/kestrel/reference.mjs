// The oracle for the invented kestrel task: L0.md implemented. Nothing
// outside this folder defines kestrel versions, so this file is the judge;
// the L0 spec-only runs are its cross-check (ladder/README.md, "Oracle
// checks"): a case most of them answer otherwise is reviewed by hand.

const NUMBER = "(0|[1-9][0-9]*)";
const VERSION = new RegExp(`^${NUMBER}\\.${NUMBER}(?:\\.${NUMBER})?(?::([a-z0-9]+))?$`);
const WILDCARD = new RegExp(`^(?:\\*|${NUMBER}\\.x|${NUMBER}\\.${NUMBER}\\.x)$`);
const OPERATOR = /^(>=|<=|>|<|=|~|\^)?(.*)$/;

class KestrelError extends Error {}

function parseVersion(text, what) {
  const match = VERSION.exec(text);
  if (match === null) throw new KestrelError(`invalid ${what}: ${JSON.stringify(text)}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] ?? 0),
    tag: match[4] ?? null,
  };
}

/** A tag's runs of letters and of digits: "rc12b" → ["rc", 12, "b"]. */
const runs = (tag) => tag.match(/[a-z]+|[0-9]+/g).map((run) => (/^[0-9]/.test(run) ? Number(run) : run));

function compareTags(a, b) {
  const ra = runs(a);
  const rb = runs(b);
  for (let i = 0; i < Math.min(ra.length, rb.length); i += 1) {
    const x = ra[i];
    const y = rb[i];
    if (typeof x === "number" && typeof y === "number") {
      if (x !== y) return x < y ? -1 : 1;
    } else if (typeof x === "number") return -1;
    else if (typeof y === "number") return 1;
    else if (x !== y) return x < y ? -1 : 1;
  }
  return Math.sign(ra.length - rb.length);
}

export function compare(a, b) {
  for (const part of ["major", "minor", "patch"]) if (a[part] !== b[part]) return a[part] < b[part] ? -1 : 1;
  if (a.tag === b.tag) return 0;
  if (a.tag === null) return 1;
  if (b.tag === null) return -1;
  return compareTags(a.tag, b.tag);
}

/** One comparator: a test on a version, and the version it names, if any. */
function parseComparator(text) {
  if (WILDCARD.test(text)) {
    const parts = text.split(".");
    if (text === "*") return { holds: () => true, names: null };
    if (parts.length === 2) return { holds: (v) => v.major === Number(parts[0]), names: null };
    return { holds: (v) => v.major === Number(parts[0]) && v.minor === Number(parts[1]), names: null };
  }
  const [, op = "=", rest] = OPERATOR.exec(text);
  const target = parseVersion(rest, "range");
  const c = (v) => compare(v, target);
  const holds = {
    "=": (v) => c(v) === 0,
    ">": (v) => c(v) > 0,
    ">=": (v) => c(v) >= 0,
    "<": (v) => c(v) < 0,
    "<=": (v) => c(v) <= 0,
    "~": (v) => c(v) >= 0 && v.major === target.major && v.minor === target.minor,
    "^": (v) =>
      c(v) >= 0 && v.major === target.major && (target.major !== 0 || v.minor === target.minor),
  }[op];
  return { holds, names: target };
}

function parseRange(text) {
  const groups = text.split("|").map((group) =>
    group.split(",").map((part) => {
      const trimmed = part.trim();
      if (trimmed === "") throw new KestrelError(`invalid range: empty comparator in ${JSON.stringify(text)}`);
      return parseComparator(trimmed);
    }),
  );
  return groups;
}

export function satisfies(version, range) {
  const v = parseVersion(version, "version");
  const groups = parseRange(range);
  return groups.some(
    (group) =>
      group.every((comparator) => comparator.holds(v)) &&
      (v.tag === null ||
        group.some(
          (comparator) =>
            comparator.names !== null &&
            comparator.names.tag !== null &&
            comparator.names.major === v.major &&
            comparator.names.minor === v.minor,
        )),
  );
}
