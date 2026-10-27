#!/usr/bin/env node
// Condition B of the spec ladder (ladder/README.md): the agent reads the
// spec at level n, and the public suite is the one written from L0. For
// each task and each level above 0, writes specs/ladder-<task>-l<n>-b/
// with L<n>.md as spec.md and L0's skeleton, public suite and hidden suite,
// so B differs from A at the same level only in the public suite. Run
// after L0's public suite is generated; calibrate the B specs after.
//
//   node bin/ladder/derive-b.mjs <task...>

import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { SPECS, args, copy, log } from "../lib.mjs";
import { TASKS, levelSlug, levelsOf } from "./build.mjs";

const { rest } = args();
let ok = true;
for (const task of rest) {
  const l0 = join(SPECS, levelSlug(task, 0));
  if (!existsSync(join(l0, "tests", "public"))) {
    log(task, `no public suite at ${l0}; run bin/generate.mjs ${levelSlug(task, 0)} first`);
    ok = false;
    continue;
  }
  for (const level of levelsOf(task).filter((n) => n > 0)) {
    const out = join(SPECS, levelSlug(task, level, "b"));
    rmSync(out, { recursive: true, force: true });
    copy(join(TASKS, task, `L${level}.md`), join(out, "spec.md"));
    for (const part of ["skeleton", "tests", "toolchain.json"]) copy(join(l0, part), join(out, part));
  }
  log(task, `condition B for levels ${levelsOf(task).filter((n) => n > 0).map((n) => `L${n}`).join(" ")}`);
}
process.exit(ok ? 0 : 1);
