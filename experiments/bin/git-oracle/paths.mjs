// The oracle's data lives under runs/git-oracle (gitignored): the case corpus,
// git's results, the flags, every build and every build's results.
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const DB = fileURLToPath(new URL("../..", import.meta.url));
export const WORK = join(DB, "runs/git-oracle");
