// Compile the reference and every stored patch-apply submission to build/<name>/dist.
import { execFile } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { DB, WORK as here } from "./paths.mjs";

const run = promisify(execFile);
const TSC = join(DB, "template/node_modules/typescript/bin/tsc");

const subs = [
  { name: "reference", src: join(DB, "specs/patch-apply/reference/src") },
];
const runs = join(DB, "runs/patch-apply");
for (const v of readdirSync(runs).filter((d) => d.endsWith("-haiku")))
  for (const r of readdirSync(join(runs, v)))
    if (existsSync(join(runs, v, r, "submission/src")))
      subs.push({ name: `${v}/${r}`, src: join(runs, v, r, "submission/src") });

const failed = [];
for (let i = 0; i < subs.length; i += 8)
  await Promise.all(
    subs.slice(i, i + 8).map(async (s) => {
      const dir = join(here, "build", s.name);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      cpSync(s.src, join(dir, "src"), {
        recursive: true,
        filter: (p) => !p.includes(".test."),
      });
      writeFileSync(join(dir, "package.json"), '{"type":"module"}\n');
      writeFileSync(
        join(dir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            strict: false,
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "NodeNext",
            rootDir: "src",
            outDir: "dist",
            skipLibCheck: true,
            types: [],
          },
          include: ["src/**/*.ts"],
        }),
      );
      try {
        await run(process.execPath, [TSC, "-p", "tsconfig.json"], { cwd: dir });
      } catch (e) {
        if (!existsSync(join(dir, "dist/index.js"))) failed.push(s.name);
      }
    }),
  );
console.log(
  subs.length,
  "built;",
  failed.length ? `no dist: ${failed.join(", ")}` : "all have dist/index.js",
);
