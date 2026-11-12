import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NODE_GLOBAL_DECLARATIONS,
  ambientDeclarations,
} from "../../src/sandbox/project.js";

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

/** UTF-16 code unit order, as the spec defines the sort. */
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A set that refuses every change once built. */
class LockedSet<T> extends Set<T> {
  private locked = false;
  constructor(values: readonly T[]) {
    super(values);
    this.locked = true;
  }
  override add(value: T): this {
    if (this.locked) throw new Error("installed was changed");
    return super.add(value);
  }
  override delete(_value: T): boolean {
    throw new Error("installed was changed");
  }
  override clear(): void {
    throw new Error("installed was changed");
  }
}

// Extends "[happy-2] NODE_GLOBAL_DECLARATIONS holds the 16 Node globals in order":
// the list is exactly the block both headers write after node:*.
test("[happy-2] NODE_GLOBAL_DECLARATIONS is the block written after node:* under either header", () => {
  assert.deepEqual([...NODE_GLOBAL_DECLARATIONS], NODE_GLOBALS);
  assert.equal(new Set(NODE_GLOBAL_DECLARATIONS).size, 16);
  for (const entry of NODE_GLOBAL_DECLARATIONS)
    assert.equal(entry.includes("node:"), false, entry);
  const untyped = linesOf(ambientDeclarations(["pg"]));
  const typed = linesOf(ambientDeclarations(["pg"], undefined, new Set(["zod"])));
  assert.deepEqual(untyped.slice(5, 21), [...NODE_GLOBAL_DECLARATIONS]);
  assert.deepEqual(typed.slice(0, 4), H_TYPED);
  assert.deepEqual(typed.slice(5, 21), [...NODE_GLOBAL_DECLARATIONS]);
});

// Extends "[boundary-1] the ambient file writes node:* and then the 16 Node globals right after the header":
// the same layout with no packages under the typed header, and nothing after it.
test("[boundary-1] with no packages and a name installed, node:* and the 16 globals follow the typed header and end the lines", () => {
  const lines = linesOf(ambientDeclarations([], undefined, new Set(["zod", "pg"])));
  assert.deepEqual(lines.slice(0, 4), H_TYPED);
  assert.equal(lines[4], 'declare module "node:*";');
  assert.deepEqual(lines.slice(5, 21), [...NODE_GLOBAL_DECLARATIONS]);
  assert.deepEqual(lines.slice(21), [""]);
});

// Extends "[boundary-1] the Node block sits in the same place under the typed header, before the first package line":
// the first package line is the smallest name not installed, or its wildcard when declared by the modules.
test("[boundary-1] the first line after the Node block is the smallest package that is not installed", () => {
  const lines = linesOf(
    ambientDeclarations(["c", "b", "a"], undefined, new Set(["a"])),
  );
  assert.deepEqual(lines.slice(4, 21), NODE);
  assert.equal(lines[21], 'declare module "b";');
  const declared = linesOf(
    ambientDeclarations(
      ["c", "b", "a"],
      { specifiers: ["b"], text: "" },
      new Set(["a"]),
    ),
  );
  assert.deepEqual(declared.slice(4, 21), NODE);
  assert.equal(declared[21], 'declare module "b/*";');
  assert.equal(declared[22], 'declare module "c";');
});

// Extends "[happy-3] with nothing installed every package is declared by shorthand and wildcard, distinct and sorted":
// many more packages, shuffled and repeated; the package lines are the same whether or
// not an unrelated name is installed.
test("[happy-3] many repeated packages are each declared once by shorthand and wildcard, sorted", () => {
  const names = [
    "zod",
    "Beta",
    "alpha",
    "_under",
    "-dash",
    "1num",
    "@scope/b",
    "@scope/a",
    "@Scope/c",
    "lodash.merge",
    "a",
    "A",
    "aa",
    "a-",
    "a.",
  ];
  const packages = [...names, ...[...names].reverse(), "zod", "a"];
  const lines = [...new Set(names)].sort(byCodeUnit).flatMap(packageLines);
  assert.equal(
    ambientDeclarations(packages),
    expected([...H_UNTYPED, ...NODE, ...lines]),
  );
  assert.equal(
    ambientDeclarations(packages, undefined, new Set(["not-a-package"])),
    expected([...H_TYPED, ...NODE, ...lines]),
  );
});

// Extends "[happy-3] package names are sorted by UTF-16 code unit and written exactly as given":
// characters beyond ASCII, where code-unit order differs from code-point and locale order,
// and a name with a quote, which is not escaped.
test("[happy-3] names beyond ASCII sort by UTF-16 code unit and every name is written unescaped", () => {
  const packages = [
    "～",
    "\u{1F600}",
    "é",
    "~",
    "z",
    'we"ird',
    "a",
    "Z",
    "0",
  ];
  const sorted = [
    "0",
    "Z",
    "a",
    'we"ird',
    "z",
    "~",
    "é",
    "\u{1F600}",
    "～",
  ];
  assert.equal(
    ambientDeclarations(packages),
    expected([...H_UNTYPED, ...NODE, ...sorted.flatMap(packageLines)]),
  );
  assert.equal(
    ambientDeclarations(packages, undefined, new Set(["é"])),
    expected([
      ...H_TYPED,
      ...NODE,
      ...sorted.filter((name) => name !== "é").flatMap(packageLines),
    ]),
  );
});

// Extends "[boundary-2] no packages gives only the untyped header and Node's declarations":
// the same with a name installed, and with an empty modules text given explicitly.
test("[boundary-2] no packages gives only the header and Node's declarations, whichever header applies", () => {
  assert.equal(
    ambientDeclarations([], { specifiers: [], text: "" }),
    expected([...H_UNTYPED, ...NODE]),
  );
  assert.equal(
    ambientDeclarations([], { specifiers: [], text: "" }, new Set(["zod"])),
    expected([...H_TYPED, ...NODE]),
  );
  assert.equal(ambientDeclarations([]).endsWith('structuredClone<T>(value: T): T;\n'), true);
});

// Extends "[boundary-2] no packages with a modules text gives the header, Node's declarations and the text as given":
// a text with no trailing newline and several specifiers, under the typed header.
test("[boundary-2] no packages with an unterminated modules text appends the text exactly after one newline", () => {
  const text = 'declare module "a" {}\r\ndeclare module "b" {}';
  assert.equal(
    ambientDeclarations([], { specifiers: ["a", "b"], text }, new Set(["a"])),
    expected([...H_TYPED, ...NODE], text),
  );
  assert.equal(
    ambientDeclarations([], { specifiers: ["a", "b"], text }),
    expected([...H_UNTYPED, ...NODE], text),
  );
});

// Extends "[happy-4] a declared module replaces its shorthand but keeps its wildcard":
// several declared modules, beside a package that is not declared, with an unrelated name installed.
test("[happy-4] several declared modules each lose only their shorthand, beside an undeclared package", () => {
  const text =
    'declare module "@acme/shared" {\n  export type Task = any;\n}\ndeclare module "lodash" {\n  export const chunk: any;\n}\n';
  const modules = { specifiers: ["lodash", "@acme/shared"], text };
  const rest = [
    'declare module "@acme/shared/*";',
    'declare module "lodash/*";',
    'declare module "zod";',
    'declare module "zod/*";',
  ];
  assert.equal(
    ambientDeclarations(["zod", "lodash", "@acme/shared", "lodash"], modules),
    expected([...H_UNTYPED, ...NODE, ...rest], text),
  );
  assert.equal(
    ambientDeclarations(
      ["zod", "lodash", "@acme/shared", "lodash"],
      modules,
      new Set(["pg"]),
    ),
    expected([...H_TYPED, ...NODE, ...rest], text),
  );
});

// Extends "[happy-4] a declared specifier that is not among the packages adds no package line of its own":
// only a specifier equal to the whole name replaces the shorthand: a subpath, another case
// or a scope alone does not.
test("[happy-4] only a specifier equal to the package name replaces its shorthand", () => {
  const modules = {
    specifiers: ["zod/v4", "Zod", "@acme", "pg"],
    text: "// modules\n",
  };
  assert.equal(
    ambientDeclarations(["zod", "@acme/sdk", "pg"], modules, new Set(["x"])),
    expected(
      [
        ...H_TYPED,
        ...NODE,
        ...packageLines("@acme/sdk"),
        'declare module "pg/*";',
        ...packageLines("zod"),
      ],
      "// modules\n",
    ),
  );
});

// Extends "[boundary-3] an explicitly empty installed set is the same as leaving it out":
// a set the caller emptied after an earlier call is read as it is at the call.
test("[boundary-3] a set emptied by its caller after a call counts as empty at the next call", () => {
  const packages = ["zod", "pg"];
  const installed = new Set(["zod"]);
  const before = ambientDeclarations(packages, undefined, installed);
  assert.deepEqual(linesOf(before).slice(0, 4), H_TYPED);
  installed.clear();
  assert.equal(
    ambientDeclarations(packages, undefined, installed),
    ambientDeclarations(packages),
  );
  assert.equal(
    ambientDeclarations(packages, undefined, installed),
    expected([...H_UNTYPED, ...NODE, ...packageLines("pg"), ...packageLines("zod")]),
  );
});

// Extends "[boundary-3] an empty installed set with modules given matches the call without a set, untyped header and all":
// more packages and modules; only a non-empty set changes the text.
test("[boundary-3] an empty set is the default for any packages and modules, and a non-empty one is not", () => {
  const modules = {
    specifiers: ["a", "c"],
    text: 'declare module "a" {}\ndeclare module "c" {}\n',
  };
  const packages = ["d", "c", "b", "a"];
  const omitted = ambientDeclarations(packages, modules);
  assert.equal(ambientDeclarations(packages, modules, new Set()), omitted);
  assert.equal(
    omitted,
    expected(
      [
        ...H_UNTYPED,
        ...NODE,
        'declare module "a/*";',
        ...packageLines("b"),
        'declare module "c/*";',
        ...packageLines("d"),
      ],
      modules.text,
    ),
  );
  assert.notEqual(ambientDeclarations(packages, modules, new Set(["b"])), omitted);
});

// Extends "[happy-5] only the packages not installed are declared, under the typed header":
// more packages, several installed, some repeated, and installed names that are not packages.
test("[happy-5] with several of many packages installed, exactly the rest are declared", () => {
  const packages = [
    "react",
    "zod",
    "pg",
    "lodash",
    "@acme/ui",
    "@acme/shared",
    "express",
    "zod",
    "react",
    "axios",
  ];
  const installed = new Set(["zod", "react", "@acme/ui", "axios", "vue", "left"]);
  const result = ambientDeclarations(packages, undefined, installed);
  assert.equal(
    result,
    expected([
      ...H_TYPED,
      ...NODE,
      ...packageLines("@acme/shared"),
      ...packageLines("express"),
      ...packageLines("lodash"),
      ...packageLines("pg"),
    ]),
  );
  for (const name of ["zod", "react", "@acme/ui", "axios"])
    assert.equal(
      linesOf(result).some((line) => line.includes(`"${name}`)),
      false,
      name,
    );
});

// Extends "[happy-5] when every package is installed only the typed header and Node's declarations remain":
// with a modules text and specifiers, which is appended unchanged.
test("[happy-5] when every package is installed the typed header, Node's declarations and the modules text remain", () => {
  const text = 'declare module "pg" {\n  export const Pool: any;\n}\n';
  assert.equal(
    ambientDeclarations(
      ["pg", "zod", "lodash"],
      { specifiers: ["pg"], text },
      new Set(["lodash", "pg", "zod"]),
    ),
    expected([...H_TYPED, ...NODE], text),
  );
});

// Extends "[boundary-4] the header depends only on whether installed is empty":
// other rows: an installed name that differs only by case, an empty-string name,
// a package list that is partly installed, and nothing at all.
test("[boundary-4] the header follows installed being empty, whatever its names", () => {
  const rows: readonly {
    packages: string[];
    installed: string[];
    header: string[];
    lines: string[];
  }[] = [
    { packages: [], installed: [], header: H_UNTYPED, lines: [] },
    { packages: ["a", "b"], installed: [], header: H_UNTYPED, lines: [...packageLines("a"), ...packageLines("b")] },
    { packages: ["a", "b"], installed: ["b"], header: H_TYPED, lines: packageLines("a") },
    { packages: ["a"], installed: ["A"], header: H_TYPED, lines: packageLines("a") },
    { packages: ["a"], installed: [""], header: H_TYPED, lines: packageLines("a") },
    { packages: ["a", "b"], installed: ["a", "b"], header: H_TYPED, lines: [] },
  ];
  for (const row of rows)
    assert.equal(
      ambientDeclarations(row.packages, undefined, new Set(row.installed)),
      expected([...row.header, ...NODE, ...row.lines]),
      JSON.stringify(row),
    );
});

// Extends "[boundary-4] several installed names, none of them packages, still switch to the typed header and skip nothing":
// a hundred installed names, none a package.
test("[boundary-4] a hundred installed names that are not packages switch the header and skip nothing", () => {
  const installed = new Set(
    Array.from({ length: 100 }, (_, index) => `other-${index}`),
  );
  assert.equal(
    ambientDeclarations(["zod", "pg", "lodash"], undefined, installed),
    expected([
      ...H_TYPED,
      ...NODE,
      ...packageLines("lodash"),
      ...packageLines("pg"),
      ...packageLines("zod"),
    ]),
  );
});

// Extends "[boundary-5] installed names match whole package names, case and all":
// installed names that are prefixes of other packages skip only the package of that exact name.
test("[boundary-5] an installed name skips its own package and no package it is a prefix of", () => {
  assert.equal(
    ambientDeclarations(
      ["zod", "zod-mini", "zodiac", "@zod/core", "@acme/sdk", "@acme/sdk-extra", "@acme/sdkx"],
      undefined,
      new Set(["zod", "@acme/sdk"]),
    ),
    expected([
      ...H_TYPED,
      ...NODE,
      ...packageLines("@acme/sdk-extra"),
      ...packageLines("@acme/sdkx"),
      ...packageLines("@zod/core"),
      ...packageLines("zod-mini"),
      ...packageLines("zodiac"),
    ]),
  );
});

// Extends "[boundary-5] an installed name differing in case or by a trailing path skips no package":
// spaces, a subpath wildcard, a full upper case scope and a bare scope skip nothing.
test("[boundary-5] installed names with spaces, subpaths or another case skip no package", () => {
  assert.equal(
    ambientDeclarations(
      ["@acme/sdk", "zod", "pg"],
      undefined,
      new Set([" zod", "zod ", "pg/*", "pg/pool", "@ACME/SDK", "@acme/", "@acme"]),
    ),
    expected([
      ...H_TYPED,
      ...NODE,
      ...packageLines("@acme/sdk"),
      ...packageLines("pg"),
      ...packageLines("zod"),
    ]),
  );
});

// Extends "[boundary-6] a module text for an installed package is still appended as given":
// a text that itself holds the installed package's shorthand and wildcard is not filtered.
test("[boundary-6] a modules text holding the installed package's own lines is appended unfiltered", () => {
  const text = 'declare module "zod";\ndeclare module "zod/*";\ndeclare module "zod" {\n  export const z: any;\n}\n';
  const result = ambientDeclarations(
    ["zod"],
    { specifiers: [], text },
    new Set(["zod"]),
  );
  assert.equal(result, expected([...H_TYPED, ...NODE], text));
  assert.ok(result.endsWith(text));
});

// Extends "[boundary-6] the text is appended unparsed beside the lines of packages that are not installed":
// several installed packages declared in a text without a final newline, beside undeclared packages.
test("[boundary-6] text for several installed packages is appended exactly, with no final newline added", () => {
  const text =
    'declare module "zod" {\r\n  export const z: any;\r\n}\r\ndeclare module "react" { export const x: any; }';
  assert.equal(
    ambientDeclarations(
      ["react", "zod", "pg", "lodash"],
      { specifiers: ["zod", "react", "lodash"], text },
      new Set(["zod", "react"]),
    ),
    expected(
      [...H_TYPED, ...NODE, 'declare module "lodash/*";', ...packageLines("pg")],
      text,
    ),
  );
});

// Extends "[boundary-7] the arguments are not mutated and repeated calls agree":
// many calls, interleaved with calls on other arguments, on a set that refuses changes.
test("[boundary-7] interleaved calls agree and change neither argument nor the Node list", () => {
  const packages = Object.freeze(["zod", "pg", "zod", "lodash"]);
  const installed = new LockedSet(["zod"]);
  const first = ambientDeclarations(packages, undefined, installed);
  const other = ambientDeclarations(packages);
  const again = ambientDeclarations(packages, undefined, installed);
  const third = ambientDeclarations(["pg"], undefined, new Set(["pg"]));
  assert.equal(first, again);
  assert.equal(
    first,
    expected([...H_TYPED, ...NODE, ...packageLines("lodash"), ...packageLines("pg")]),
  );
  assert.equal(
    other,
    expected([
      ...H_UNTYPED,
      ...NODE,
      ...packageLines("lodash"),
      ...packageLines("pg"),
      ...packageLines("zod"),
    ]),
  );
  assert.equal(third, expected([...H_TYPED, ...NODE]));
  assert.equal(ambientDeclarations(packages, undefined, installed), first);
  assert.deepEqual(packages, ["zod", "pg", "zod", "lodash"]);
  assert.deepEqual([...installed], ["zod"]);
  assert.deepEqual([...NODE_GLOBAL_DECLARATIONS], NODE_GLOBALS);
});

// Extends "[boundary-7] frozen arguments are read, not changed, and give the same text as fresh copies":
// a set changed by its caller between calls gives the text for its new content, not a remembered one.
test("[boundary-7] equal arguments give equal text, and a caller's change to the set is read afresh", () => {
  const modules = Object.freeze({
    specifiers: Object.freeze(["lodash"]),
    text: 'declare module "lodash" {}\n',
  });
  const installed = new Set(["zod"]);
  const first = ambientDeclarations(["zod", "pg", "lodash"], modules, installed);
  installed.add("pg");
  const second = ambientDeclarations(["zod", "pg", "lodash"], modules, installed);
  assert.equal(
    first,
    expected(
      [...H_TYPED, ...NODE, 'declare module "lodash/*";', ...packageLines("pg")],
      modules.text,
    ),
  );
  assert.equal(
    second,
    expected([...H_TYPED, ...NODE, 'declare module "lodash/*";'], modules.text),
  );
  assert.equal(
    ambientDeclarations(["zod", "pg", "lodash"], modules, new Set(["pg", "zod"])),
    second,
  );
  assert.deepEqual(modules.specifiers, ["lodash"]);
});
