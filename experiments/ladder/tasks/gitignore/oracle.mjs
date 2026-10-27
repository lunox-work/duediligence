// git as the judge. Each set becomes a throwaway repository whose
// .git/info/exclude holds the set's .gitignore text (the same rules as a
// root .gitignore, without a .gitignore file in the tree for patterns to
// match), with every path created as an empty file. `git ls-files -o -i
// --exclude-standard` then lists exactly the files git ignores, parent
// directories included. Global and system config are off and matching is
// case-sensitive, so the host's settings and its case-insensitive
// filesystem cannot change an answer.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const git = (cwd, ...argv) => {
  const run = spawnSync("git", ["-c", "core.ignorecase=false", ...argv], { cwd, env, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`git ${argv.join(" ")}: ${run.stderr}`);
  return run.stdout;
};

export const version = () => git(tmpdir(), "--version").trim();

/** For one set: path → whether git ignores it. */
export function answer({ gitignore, paths }) {
  const dir = mkdtempSync(join(tmpdir(), "ladder-gitignore-"));
  try {
    git(dir, "init", "-q", ".");
    writeFileSync(join(dir, ".git", "info", "exclude"), gitignore);
    for (const path of paths) {
      mkdirSync(join(dir, dirname(path)), { recursive: true });
      writeFileSync(join(dir, path), "");
    }
    const ignored = new Set(git(dir, "ls-files", "-z", "-o", "-i", "--exclude-standard").split("\0").filter(Boolean));
    const untracked = new Set(git(dir, "ls-files", "-z", "-o", "--exclude-standard").split("\0").filter(Boolean));
    return paths.map((path) => {
      if (ignored.has(path) === untracked.has(path)) throw new Error(`git lists ${JSON.stringify(path)} as neither or both`);
      return ignored.has(path);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
