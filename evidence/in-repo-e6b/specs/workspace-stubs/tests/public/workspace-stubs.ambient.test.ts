import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NODE_GLOBAL_DECLARATIONS,
  ambientDeclarations,
} from "../src/sandbox/project.js";

const H_UNTYPED = [
  "// The same declarations the slice was type-checked against: Node's",
  "// modules and globals untyped, and every package untyped. The project",
  "// installs its approved packages for real; their own types are not",
  "// consulted, so a contribution is checked against the slice's contract.",
];
const H_TYPED = [
  "// The same declarations the slice was type-checked against: Node's",
  "// modules and globals untyped, and every package untyped but those the",
  "// project installs and the slice was checked against: they keep their",
  "// own published types.",
];
const NODE_GLOBALS = [
  "declare var process: any;",
  "declare var Buffer: any;",
  "declare var global: any;",
  "declare var globalThis: any;",
  "declare var require: any;",
  "declare var module: any;",
  "declare var exports: any;",
  "declare var __dirname: string;",
  "declare var __filename: string;",
  "declare var console: any;",
  "declare function setTimeout(handler: (...args: any[]) => void, ms?: number, ...args: any[]): any;",
  "declare function clearTimeout(handle: any): void;",
  "declare function setInterval(handler: (...args: any[]) => void, ms?: number, ...args: any[]): any;",
  "declare function clearInterval(handle: any): void;",
  "declare function queueMicrotask(callback: () => void): void;",
  "declare function structuredClone<T>(value: T): T;",
];
const NODE = ['declare module "node:*";', ...NODE_GLOBALS];

/** The expected text: lines joined by "\n", one "\n", then the modules' text. */
const expected = (lines: readonly string[], text = "") =>
  `${lines.join("\n")}\n${text}`;

const linesOf = (text: string) => text.split("\n");

const packageLines = (name: string) => [
  `declare module "${name}";`,
  `declare module "${name}/*";`,
];

test("[boundary-1] the ambient file writes node:* and then the 16 Node globals right after the header", () => {
  const lines = linesOf(ambientDeclarations([]));
  assert.deepEqual(lines.slice(0, 4), H_UNTYPED);
  assert.equal(lines[4], 'declare module "node:*";');
  assert.deepEqual(lines.slice(5, 21), [...NODE_GLOBAL_DECLARATIONS]);
  assert.deepEqual(lines.slice(5, 21), NODE_GLOBALS);
});

test("[boundary-1] the Node block sits in the same place under the typed header, before the first package line", () => {
  const lines = linesOf(ambientDeclarations(["zod"], undefined, new Set(["pg"])));
  assert.deepEqual(lines.slice(0, 4), H_TYPED);
  assert.deepEqual(lines.slice(4, 21), NODE);
  assert.equal(lines[21], 'declare module "zod";');
});

test("[happy-3] with nothing installed every package is declared by shorthand and wildcard, distinct and sorted", () => {
  assert.equal(
    ambientDeclarations(["zod", "@acme/shared", "zod"]),
    expected([
      ...H_UNTYPED,
      ...NODE,
      'declare module "@acme/shared";',
      'declare module "@acme/shared/*";',
      'declare module "zod";',
      'declare module "zod/*";',
    ]),
  );
});

test("[happy-3] package names are sorted by UTF-16 code unit and written exactly as given", () => {
  assert.equal(
    ambientDeclarations(["b", "a-b", "B", "_x", "b"]),
    expected([
      ...H_UNTYPED,
      ...NODE,
      ...packageLines("B"),
      ...packageLines("_x"),
      ...packageLines("a-b"),
      ...packageLines("b"),
    ]),
  );
});

test("[boundary-2] no packages gives only the untyped header and Node's declarations", () => {
  assert.equal(ambientDeclarations([]), expected([...H_UNTYPED, ...NODE]));
});

test("[boundary-2] no packages with a modules text gives the header, Node's declarations and the text as given", () => {
  const text = 'declare module "x" {}\n';
  assert.equal(
    ambientDeclarations([], { specifiers: ["x"], text }),
    expected([...H_UNTYPED, ...NODE], text),
  );
});

test("[happy-4] a declared module replaces its shorthand but keeps its wildcard", () => {
  const text = 'declare module "@acme/shared" {\n  export type Task = any;\n}\n';
  const result = ambientDeclarations(["@acme/shared", "zod"], {
    specifiers: ["@acme/shared"],
    text,
  });
  const lines = linesOf(result);
  assert.equal(lines.includes('declare module "@acme/shared";'), false);
  assert.ok(lines.includes('declare module "@acme/shared/*";'));
  assert.ok(lines.includes('declare module "zod";'));
  assert.ok(lines.includes('declare module "zod/*";'));
  assert.ok(result.endsWith(text));
  assert.equal(
    result,
    expected(
      [
        ...H_UNTYPED,
        ...NODE,
        'declare module "@acme/shared/*";',
        'declare module "zod";',
        'declare module "zod/*";',
      ],
      text,
    ),
  );
});

test("[happy-4] a declared specifier that is not among the packages adds no package line of its own", () => {
  const text = 'declare module "pg" {\n  export const Pool: any;\n}\n';
  assert.equal(
    ambientDeclarations(["zod"], { specifiers: ["pg"], text }),
    expected([...H_UNTYPED, ...NODE, ...packageLines("zod")], text),
  );
});

test("[boundary-3] an explicitly empty installed set is the same as leaving it out", () => {
  assert.equal(
    ambientDeclarations(["zod"], { specifiers: [], text: "" }, new Set()),
    ambientDeclarations(["zod"]),
  );
});

test("[boundary-3] an empty installed set with modules given matches the call without a set, untyped header and all", () => {
  const modules = {
    specifiers: ["zod"],
    text: 'declare module "zod" {\n  export const z: any;\n}\n',
  };
  const withEmpty = ambientDeclarations(["pg", "zod"], modules, new Set());
  assert.equal(withEmpty, ambientDeclarations(["pg", "zod"], modules));
  assert.equal(
    ambientDeclarations(["pg", "zod"], undefined, new Set()),
    ambientDeclarations(["pg", "zod"]),
  );
  assert.deepEqual(linesOf(withEmpty).slice(0, 4), H_UNTYPED);
});

test("[happy-5] only the packages not installed are declared, under the typed header", () => {
  const result = ambientDeclarations(
    ["lodash", "zod", "pg"],
    { specifiers: [], text: "" },
    new Set(["zod"]),
  );
  assert.equal(
    result,
    expected([
      ...H_TYPED,
      ...NODE,
      'declare module "lodash";',
      'declare module "lodash/*";',
      'declare module "pg";',
      'declare module "pg/*";',
    ]),
  );
  assert.equal(
    linesOf(result).some((line) => line.includes("zod")),
    false,
  );
});

test("[happy-5] when every package is installed only the typed header and Node's declarations remain", () => {
  assert.equal(
    ambientDeclarations(
      ["@acme/ui", "zod", "zod"],
      undefined,
      new Set(["zod", "@acme/ui"]),
    ),
    expected([...H_TYPED, ...NODE]),
  );
});

test("[boundary-4] the header depends only on whether installed is empty", () => {
  const rows: readonly {
    packages: string[];
    installed: string[];
    header: string[];
    lines: string[];
  }[] = [
    {
      packages: ["zod"],
      installed: [],
      header: H_UNTYPED,
      lines: packageLines("zod"),
    },
    { packages: ["zod"], installed: ["zod"], header: H_TYPED, lines: [] },
    {
      packages: ["zod"],
      installed: ["left"],
      header: H_TYPED,
      lines: packageLines("zod"),
    },
    { packages: [], installed: ["zod"], header: H_TYPED, lines: [] },
  ];
  for (const row of rows)
    assert.equal(
      ambientDeclarations(row.packages, undefined, new Set(row.installed)),
      expected([...row.header, ...NODE, ...row.lines]),
      JSON.stringify(row),
    );
});

test("[boundary-4] several installed names, none of them packages, still switch to the typed header and skip nothing", () => {
  assert.equal(
    ambientDeclarations(["pg", "zod"], undefined, new Set(["left", "right"])),
    expected([...H_TYPED, ...NODE, ...packageLines("pg"), ...packageLines("zod")]),
  );
});

test("[boundary-5] installed names match whole package names, case and all", () => {
  const lines = linesOf(
    ambientDeclarations(["@acme/sdk", "Zod"], undefined, new Set(["@acme", "zod"])),
  );
  for (const line of [
    'declare module "@acme/sdk";',
    'declare module "@acme/sdk/*";',
    'declare module "Zod";',
    'declare module "Zod/*";',
  ])
    assert.ok(lines.includes(line), line);
});

test("[boundary-5] an installed name differing in case or by a trailing path skips no package", () => {
  assert.equal(
    ambientDeclarations(
      ["@acme/sdk", "zod"],
      undefined,
      new Set(["ZOD", "@acme/sdk/", "zod/*"]),
    ),
    expected([
      ...H_TYPED,
      ...NODE,
      ...packageLines("@acme/sdk"),
      ...packageLines("zod"),
    ]),
  );
});

test("[boundary-6] a module text for an installed package is still appended as given", () => {
  const text = 'declare module "zod" {\n  export const z: any;\n}\n';
  const result = ambientDeclarations(
    ["zod"],
    { specifiers: ["zod"], text },
    new Set(["zod"]),
  );
  const lines = linesOf(result);
  assert.equal(lines.includes('declare module "zod";'), false);
  assert.equal(lines.includes('declare module "zod/*";'), false);
  assert.ok(result.endsWith(text));
});

test("[boundary-6] the text is appended unparsed beside the lines of packages that are not installed", () => {
  const text =
    'declare module "zod" {\n  export const z: any;\n}\ndeclare module "pg" {\n  export const Pool: any;\n}\n';
  assert.equal(
    ambientDeclarations(
      ["zod", "pg"],
      { specifiers: ["zod", "pg"], text },
      new Set(["zod"]),
    ),
    expected([...H_TYPED, ...NODE, 'declare module "pg/*";'], text),
  );
});

test("[boundary-7] the arguments are not mutated and repeated calls agree", () => {
  const packages = ["zod", "pg"];
  const installed = new Set(["zod"]);
  const first = ambientDeclarations(packages, undefined, installed);
  const second = ambientDeclarations(packages, undefined, installed);
  assert.equal(first, second);
  assert.deepEqual(packages, ["zod", "pg"]);
  assert.deepEqual([...installed], ["zod"]);
});

test("[boundary-7] frozen arguments are read, not changed, and give the same text as fresh copies", () => {
  const packages = Object.freeze(["zod", "pg", "lodash"]);
  const specifiers = Object.freeze(["pg"]);
  const modules = Object.freeze({
    specifiers,
    text: 'declare module "pg" {}\n',
  });
  const installed = new Set(["zod"]);
  const result = ambientDeclarations(packages, modules, installed);
  assert.equal(
    result,
    ambientDeclarations(
      ["zod", "pg", "lodash"],
      { specifiers: ["pg"], text: 'declare module "pg" {}\n' },
      new Set(["zod"]),
    ),
  );
  assert.deepEqual(packages, ["zod", "pg", "lodash"]);
  assert.deepEqual(specifiers, ["pg"]);
  assert.deepEqual([...installed], ["zod"]);
  assert.equal(NODE_GLOBAL_DECLARATIONS.length, 16);
});
