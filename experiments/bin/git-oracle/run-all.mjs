// Run every build against every case, 6 at a time, with a 10 s per-case
// watchdog. Writes results/<name>.jsonl. Usage: node run-all.mjs [nameFilter]
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { WORK as here } from "./paths.mjs";

const script = new URL("run-sub.mjs", import.meta.url).pathname;

const cases = join(here, "cases.jsonl");
const total = readFileSync(join(here, "cases.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean).length;
const names = [];
const walk = (d, pre = "") => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const n = pre ? `${pre}/${e.name}` : e.name;
    if (existsSync(join(d, e.name, "dist/index.js"))) names.push(n);
    else walk(join(d, e.name), n);
  }
};
walk(join(here, "build"));
const todo = names.filter(
  (n) => !process.argv[2] || n.includes(process.argv[2]),
);

function runOne(name) {
  return new Promise((resolve) => {
    const lines = [];
    let next = 0;
    const start = () => {
      if (next >= total) return finish();
      const p = spawn(
        process.execPath,
        [
          "--max-old-space-size=4096",
          script,
          join(here, "build", name, "dist/index.js"),
          cases,
          String(next),
        ],
        { stdio: ["ignore", "pipe", "ignore"] },
      );
      let timer;
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(() => p.kill("SIGKILL"), 10_000);
      };
      arm();
      createInterface({ input: p.stdout }).on("line", (l) => {
        lines.push(l);
        next++;
        arm();
      });
      p.on("close", () => {
        clearTimeout(timer);
        if (next >= total) return finish();
        // Hung or crashed on case `next`: record it and skip past.
        lines.push(JSON.stringify({ id: next, timeout: true }));
        next++;
        start();
      });
    };
    const finish = () => {
      const out = join(here, "results", `${name}.jsonl`);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, lines.join("\n") + "\n");
      resolve();
    };
    start();
  });
}

let done = 0;
const queue = [...todo];
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const n = queue.shift();
      await runOne(n);
      console.log(`${++done}/${todo.length} ${n}`);
    }
  }),
);
