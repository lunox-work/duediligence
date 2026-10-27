// The invented kestrel task: `satisfies(version, range)`, judged by
// reference.mjs. Cases are drawn per rule of rules.json with versions on
// both sides of each rule, many of them where a semver habit gives the
// other answer (a `-` tag, `||`, space-separated comparators, tags
// compared as strings, `^0.x` read as `^1.x`, tagged versions admitted by
// an untagged bound).

import { satisfies } from "./reference.mjs";

export const fn = "satisfies";
export const oracleVersion = () => "ladder/tasks/kestrel/reference.mjs";
const PER_RULE = 44;

const num = (r) => r.pick([0, 0, 1, 2, 3, 4, 7, 10, 12, 25]);
const core = (r) => `${num(r)}.${num(r)}.${num(r)}`;
const TAGS = ["a", "b", "rc", "rc1", "rc2", "rc10", "beta", "beta2", "beta10", "2", "10", "1a", "a1", "rc1b", "alpha", "z9"];

const rules = {
  // A version is MAJOR.MINOR[.PATCH][:tag]; a missing patch is 0; nothing else parses.
  R1: (r) => {
    const valid = [`${num(r)}.${num(r)}`, core(r), `${core(r)}:${r.pick(TAGS)}`, `${num(r)}.${num(r)}:${r.pick(TAGS)}`];
    const invalid = [
      `0${r.int(1, 9)}.${num(r)}`, `${num(r)}`, `${core(r)}.${num(r)}`, `v${core(r)}`, `${core(r)}:`,
      `${core(r)}:RC1`, `${core(r)}-rc1`, ` ${core(r)}`, `${num(r)}.${num(r)}.0${r.int(1, 9)}`, "", `${num(r)}.x`, `${core(r)}:rc.1`,
    ];
    const v = r.bool() ? r.pick(valid) : r.pick(invalid);
    const exact = v.replace(/^(\d+\.\d+)(?=$|:)/, "$1.0");
    const range = r.pick([`=${exact}`, `${exact}`, `>=0.0`, `<=${v}`]);
    return [v, range];
  },
  // Cores compare numerically; untagged above tagged; tags compare run by run.
  R2: (r) => {
    const m = `${num(r)}.${num(r)}`;
    if (r.bool()) {
      const [a, b] = [core(r), core(r)];
      return [a, `${r.pick(["<", ">", "<=", ">="])}${b}`];
    }
    const [s, t] = r.pickN(TAGS, 2);
    return [`${m}.0:${s}`, `${r.pick(["<", ">", "<=", ">="])}${m}.0:${t}`];
  },
  // =, >, >=, <, <= and a bare version; 2.4 equals 2.4.0.
  R3: (r) => {
    const a = core(r);
    const [maj, min] = a.split(".");
    const b = r.pick([a, `${maj}.${min}`, core(r), `${maj}.${min}.${Number(a.split(".")[2]) + 1}`]);
    return [r.pick([a, `${maj}.${min}`]), `${r.pick(["=", ">", ">=", "<", "<=", ""])}${b}`];
  },
  // ~V: at least V, same major and minor.
  R4: (r) => {
    const [maj, min, pat] = [num(r), num(r), num(r)];
    const v = r.pick([`${maj}.${min}.${pat + r.int(0, 3)}`, `${maj}.${min + 1}.0`, `${maj}.${min}`, `${maj + 1}.${min}.${pat}`, `${maj}.${Math.max(0, min - 1)}.9`]);
    return [v, `~${maj}.${min}${r.bool() ? `.${pat}` : ""}`];
  },
  // ^V: at least V, same major; for major 0, same major and minor.
  R5: (r) => {
    const maj = r.pick([0, 0, 1, 2, 3]);
    const [min, pat] = [num(r), num(r)];
    const v = r.pick([`${maj}.${min}.${pat + r.int(0, 2)}`, `${maj}.${min + r.int(1, 3)}.0`, `${maj + 1}.0.0`, `${maj}.${min}`, `${maj}.${Math.max(0, min - 1)}.0`]);
    return [v, `^${maj}.${min}.${pat}`];
  },
  // *, M.x and M.N.x; no operator in front of a wildcard.
  R6: (r) => {
    const [maj, min] = [num(r), num(r)];
    const v = r.pick([core(r), `${maj}.${min}.${num(r)}`, `${maj}.${num(r)}.${num(r)}`, `${maj + 1}.${min}.0`]);
    const range = r.pick(["*", `${maj}.x`, `${maj}.${min}.x`, `>${maj}.x`, `${maj}.x.x`, `x`, `${maj}.*`, `~${maj}.${min}.x`]);
    return [v, range];
  },
  // `,` is AND, `|` is OR; spaces only around separators and at the ends.
  R7: (r) => {
    const [a, b, v] = [core(r), core(r), core(r)];
    const range = r.pick([
      `>=${a},<${b}`, ` >=${a} , <${b} `, `>=${a} <${b}`, `=${a}|=${b}|=${v}`, `<${a} | >${b}`, `=${a}||=${v}`,
      `>=${a},`, `|=${v}`, `>=${a},<${b}|=${v}`, `>= ${a}`, `=${v}, *`, `${v} - ${b}`,
    ]);
    return [v, range];
  },
  // A tagged version needs a comparator in the same group naming a tagged
  // version with the same major and minor.
  R8: (r) => {
    const [maj, min] = [num(r), num(r)];
    const v = `${maj}.${min}.${r.int(0, 3)}:${r.pick(TAGS)}`;
    const range = r.pick([
      `>=${maj}.${min}.0:a`, `>=${maj}.${min}.0`, `*`, `${maj}.x`, `>=${maj}.${min}.0:a,<${maj + 1}.0.0`,
      `>=${maj}.${Math.max(0, min - 1)}.0:a`, `^${maj}.${min}.0:a`, `~${maj}.${min}.0`, `>=${maj}.${min}.0|>=${maj}.${min}.0:a`,
      `<${maj}.${min + 1}.0:a`, `>=${maj}.${min}.9:rc`,
    ]);
    return [v, range];
  },
  // An invalid version throws naming "version"; an invalid range, "range"; the version is checked first.
  R9: (r) => {
    const good = core(r);
    return r.pick([
      [`${good}-rc1`, `*`], [good, `>>${good}`], [good, ``], [`x${good}`, `nonsense`], [good, `=${good}:`],
      [`${good}`, `>=${good},<${good}x`], [`1.2.3.4`, `=1.2.3`], [good, `==${good}`], [good, `~${num(r)}`],
    ]);
  },
};

export function cases(rng) {
  const out = [];
  for (const [rule, draw] of Object.entries(rules)) {
    const seen = new Set();
    for (let tries = 0; seen.size < PER_RULE && tries < PER_RULE * 20; tries += 1) {
      const args = draw(rng);
      const key = JSON.stringify(args);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ rule, args });
    }
  }
  return out;
}

/** The reference is the oracle; an error's expected form is the word its message must contain. */
export const oracle = (items) =>
  items.map(({ args }) => {
    try {
      return satisfies(...args);
    } catch (error) {
      return { throws: /invalid version/.test(error.message) ? "version" : "range" };
    }
  });
