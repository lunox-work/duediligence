// The gitignore task: `isIgnored(gitignore, path)` against git itself.
import { generate } from "./cases.mjs";
import { answer, version } from "./oracle.mjs";

export const fn = "isIgnored";
export const oracleVersion = version;

/** One case per path of each generated set; `set` keeps a set's paths in one repository. */
export const cases = (rng) =>
  generate(rng).flatMap((set, at) => set.paths.map((path) => ({ rule: set.rule, set: at, args: [set.gitignore, path] })));

export function oracle(cases) {
  const sets = new Map();
  for (const [at, item] of cases.entries()) {
    const set = sets.get(item.set) ?? { gitignore: item.args[0], paths: [], at: [] };
    set.paths.push(item.args[1]);
    set.at.push(at);
    sets.set(item.set, set);
  }
  const out = new Array(cases.length);
  for (const set of sets.values()) answer(set).forEach((ignored, k) => (out[set.at[k]] = ignored));
  return out;
}
