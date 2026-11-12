import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ABSTRACTIONS_TOOL_VERSION,
  BRIEF_TOOL_VERSION,
  DATA_MODEL_TOOL_VERSION,
  DOCUMENTS_TOOL_VERSION,
  FIXTURES_TOOL_VERSION,
  GRAPHIFY_TOOL_VERSION,
  SANDBOX_BUILD_RUN_VERSION,
  SCOPE_TOOL_VERSION,
  SLICE_TOOL_VERSION,
  STARTER_TOOL_VERSION,
  toolVersionOf,
} from "../src/analysis.js";
import type { AnalysisTool } from "../src/analysis.js";
import {
  NODE_GLOBAL_DECLARATIONS,
  ambientDeclarations,
} from "../src/sandbox/project.js";

/** The 4 lines of HEADER, as the spec writes them. */
const H = [
  "// The same declarations the slice was type-checked against: Node's",
  "// modules and globals untyped, and every package untyped. A package the",
  "// project installs is declared by a pattern, which the compiler",
  "// consults only when the package brings no types of its own.",
];

const CLASS_NAMES = [
  "AbortController",
  "AbortSignal",
  "Blob",
  "BroadcastChannel",
  "DOMException",
  "Event",
  "EventTarget",
  "File",
  "FormData",
  "Headers",
  "MessageChannel",
  "MessagePort",
  "ReadableStream",
  "Request",
  "Response",
  "TextDecoder",
  "TextEncoder",
  "TransformStream",
  "URL",
  "URLSearchParams",
  "WebSocket",
  "WritableStream",
];

/** The 81 entries of NODE_GLOBAL_DECLARATIONS, as the spec writes them. */
const NODE_LIST = [
  'declare module "node:*";',
  "declare var process: any;",
  "declare var Buffer: any;",
  "declare var global: any;",
  "declare var require: any;",
  "declare var module: any;",
  "declare var exports: any;",
  "declare var __dirname: string;",
  "declare var __filename: string;",
  "declare var console: any;",
  "declare var performance: any;",
  "declare var crypto: any;",
  "declare function setTimeout(handler: (...args: any[]) => void, ms?: number, ...args: any[]): any;",
  "declare function clearTimeout(handle: any): void;",
  "declare function setInterval(handler: (...args: any[]) => void, ms?: number, ...args: any[]): any;",
  "declare function clearInterval(handle: any): void;",
  "declare function setImmediate(handler: (...args: any[]) => void, ...args: any[]): any;",
  "declare function clearImmediate(handle: any): void;",
  "declare function queueMicrotask(callback: () => void): void;",
  "declare function structuredClone<T>(value: T): T;",
  "declare function fetch(input: any, init?: any): Promise<any>;",
  "declare function atob(data: string): string;",
  "declare function btoa(data: string): string;",
  ...CLASS_NAMES.flatMap((name) => [
    `type ${name}<T0 = any, T1 = any> = any;`,
    `declare var ${name}: any;`,
  ]),
  "declare namespace NodeJS {",
  "  type Dict = any;",
  "  type ErrnoException = any;",
  "  type Immediate = any;",
  "  type Process = any;",
  "  type ProcessEnv = any;",
  "  type ReadOnlyDict = any;",
  "  type ReadableStream = any;",
  "  type ReadWriteStream = any;",
  "  type Signals = any;",
  "  type Timeout = any;",
  "  type Timer = any;",
  "  type WritableStream = any;",
  "}",
];

/** NODE: the 81 entries followed by the globalThis line. */
const NODE = [...NODE_LIST, "declare var globalThis: any;"];

/** H, NODE and the package lines, joined by "\n" and followed by "\n". */
const expected = (packageLines: readonly string[], text = "") =>
  `${[...H, ...NODE, ...packageLines].join("\n")}\n${text}`;

/** The lines after H and NODE, when the modules' text is empty. */
const packageLinesOf = (result: string): string[] => {
  const lines = result.split("\n");
  assert.equal(lines.at(-1), "");
  return lines.slice(H.length + NODE.length, -1);
};

const linesOf = (result: string): string[] => result.split("\n");

test("[happy-1] toolVersionOf reports the bumped slice and sandbox-build versions and the rest unchanged", () => {
  const table: readonly [AnalysisTool, string][] = [
    ["slice", "slice@4"],
    ["sandbox_build", "sandbox_build@9"],
    ["graphify", "graphifyy@0.4.18+driver-1"],
    ["abstractions", "abstractions@3"],
    ["data_model", "data_model@1"],
    ["documents", "documents@1"],
    ["brief", "brief@1"],
    ["scope", "scope@5"],
    ["fixtures", "fixtures@3"],
    ["sandbox_starter", "sandbox_starter@4"],
  ];
  for (const [tool, version] of table)
    assert.equal(toolVersionOf(tool), version, tool);
  assert.equal(SLICE_TOOL_VERSION, "slice@4");
  assert.equal(SANDBOX_BUILD_RUN_VERSION, "sandbox_build@9");
});

test("[happy-1] every tool version constant is the one toolVersionOf reports, the starter's included", () => {
  assert.equal(toolVersionOf("slice"), SLICE_TOOL_VERSION);
  assert.equal(toolVersionOf("sandbox_build"), SANDBOX_BUILD_RUN_VERSION);
  assert.equal(GRAPHIFY_TOOL_VERSION, "graphifyy@0.4.18+driver-1");
  assert.equal(ABSTRACTIONS_TOOL_VERSION, "abstractions@3");
  assert.equal(DATA_MODEL_TOOL_VERSION, "data_model@1");
  assert.equal(DOCUMENTS_TOOL_VERSION, "documents@1");
  assert.equal(BRIEF_TOOL_VERSION, "brief@1");
  assert.equal(SCOPE_TOOL_VERSION, "scope@5");
  assert.equal(FIXTURES_TOOL_VERSION, "fixtures@3");
  assert.equal(STARTER_TOOL_VERSION, "sandbox_starter@4");
  assert.equal(toolVersionOf("sandbox_starter"), "sandbox_starter@4");
});

test("[happy-2] NODE_GLOBAL_DECLARATIONS holds the 81 declarations in order", () => {
  assert.equal(NODE_GLOBAL_DECLARATIONS.length, 81);
  assert.equal(NODE_GLOBAL_DECLARATIONS[0], 'declare module "node:*";');
  assert.equal(NODE_GLOBAL_DECLARATIONS[1], "declare var process: any;");
  assert.equal(NODE_GLOBAL_DECLARATIONS[9], "declare var console: any;");
  assert.equal(
    NODE_GLOBAL_DECLARATIONS[22],
    "declare function btoa(data: string): string;",
  );
  assert.equal(
    NODE_GLOBAL_DECLARATIONS[23],
    "type AbortController<T0 = any, T1 = any> = any;",
  );
  assert.equal(
    NODE_GLOBAL_DECLARATIONS[24],
    "declare var AbortController: any;",
  );
  assert.equal(NODE_GLOBAL_DECLARATIONS[66], "declare var WritableStream: any;");
  assert.equal(NODE_GLOBAL_DECLARATIONS[67], "declare namespace NodeJS {");
  assert.equal(NODE_GLOBAL_DECLARATIONS[68], "  type Dict = any;");
  assert.equal(NODE_GLOBAL_DECLARATIONS[80], "}");
  assert.equal(
    NODE_GLOBAL_DECLARATIONS.includes("declare var globalThis: any;"),
    false,
  );
  for (const entry of NODE_GLOBAL_DECLARATIONS)
    assert.equal(entry.includes("\n"), false, entry);
});

test("[happy-2] NODE_GLOBAL_DECLARATIONS is exactly the specified list, and not frozen", () => {
  assert.deepEqual([...NODE_GLOBAL_DECLARATIONS], NODE_LIST);
  assert.equal(Object.isFrozen(NODE_GLOBAL_DECLARATIONS), false);
});

test("[boundary-1] the ambient file writes the Node list right after the header, then globalThis", () => {
  const lines = linesOf(ambientDeclarations([]));
  assert.deepEqual(lines.slice(0, H.length), H);
  assert.deepEqual(
    lines.slice(H.length, H.length + NODE_GLOBAL_DECLARATIONS.length),
    [...NODE_GLOBAL_DECLARATIONS],
  );
  assert.equal(
    lines[H.length + NODE_GLOBAL_DECLARATIONS.length],
    "declare var globalThis: any;",
  );
});

test("[boundary-1] package lines come only after the globalThis line", () => {
  const lines = linesOf(ambientDeclarations(["zod"], undefined, new Set(["pg"])));
  assert.deepEqual(lines.slice(0, H.length + NODE.length), [...H, ...NODE]);
  assert.deepEqual(lines.slice(H.length + NODE.length), [
    'declare module "zod";',
    'declare module "zod/*";',
    "",
  ]);
});

test("[happy-3] every package is declared untyped by shorthand and wildcard, distinct and sorted", () => {
  assert.equal(
    ambientDeclarations(["zod", "@acme/shared", "zod"]),
    expected([
      'declare module "@acme/shared";',
      'declare module "@acme/shared/*";',
      'declare module "zod";',
      'declare module "zod/*";',
    ]),
  );
});

test("[happy-3] package names sort by UTF-16 code unit and are written without escaping", () => {
  assert.deepEqual(packageLinesOf(ambientDeclarations(["b", "a", "_x", "B", "a"])), [
    'declare module "B";',
    'declare module "B/*";',
    'declare module "_x";',
    'declare module "_x/*";',
    'declare module "a";',
    'declare module "a/*";',
    'declare module "b";',
    'declare module "b/*";',
  ]);
});

test("[boundary-2] no packages gives only the header and Node's declarations", () => {
  assert.equal(ambientDeclarations([]), `${[...H, ...NODE].join("\n")}\n`);
});

test("[boundary-2] with no packages the modules' text still follows the final newline as given", () => {
  const text = "// anything\n  at all";
  assert.equal(
    ambientDeclarations([], { specifiers: [], text }),
    `${[...H, ...NODE].join("\n")}\n${text}`,
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
        'declare module "@acme/shared/*";',
        'declare module "zod";',
        'declare module "zod/*";',
      ],
      text,
    ),
  );
});

test("[happy-4] a declared specifier that is not among the packages adds no package line", () => {
  const text = 'declare module "pg" {\n  export const Pool: any;\n}\n';
  assert.equal(
    ambientDeclarations(["zod"], { specifiers: ["pg"], text }),
    expected(['declare module "zod";', 'declare module "zod/*";'], text),
  );
});

test("[boundary-3] an explicitly empty installed set is the same as leaving it out", () => {
  assert.equal(
    ambientDeclarations(["zod"], { specifiers: [], text: "" }, new Set()),
    ambientDeclarations(["zod"]),
  );
});

test("[boundary-3] undefined modules and an empty installed set take the defaults", () => {
  assert.equal(
    ambientDeclarations(["zod", "pg"], undefined, new Set()),
    ambientDeclarations(["zod", "pg"]),
  );
});

test("[happy-5] an installed package gets one pattern line in place of its shorthand and wildcard", () => {
  const result = ambientDeclarations(
    ["lodash", "zod", "pg"],
    undefined,
    new Set(["zod"]),
  );
  assert.equal(
    result,
    expected([
      'declare module "lodash";',
      'declare module "lodash/*";',
      'declare module "pg";',
      'declare module "pg/*";',
      'declare module "zod*";',
    ]),
  );
  const lines = linesOf(result);
  assert.equal(lines.includes('declare module "zod";'), false);
  assert.equal(lines.includes('declare module "zod/*";'), false);
});

test("[happy-5] a scoped installed package gets its pattern line unescaped, in sorted place", () => {
  assert.deepEqual(
    packageLinesOf(
      ambientDeclarations(["zod", "@acme/sdk"], undefined, new Set(["@acme/sdk"])),
    ),
    ['declare module "@acme/sdk*";', 'declare module "zod";', 'declare module "zod/*";'],
  );
});

test("[boundary-4] the header never changes; installed changes only the package lines", () => {
  const rows: readonly [string[], Set<string>, string[]][] = [
    [["zod"], new Set(), ['declare module "zod";', 'declare module "zod/*";']],
    [["zod"], new Set(["zod"]), ['declare module "zod*";']],
    [["zod"], new Set(["left"]), ['declare module "zod";', 'declare module "zod/*";']],
    [[], new Set(["zod"]), []],
  ];
  for (const [packages, installed, lines] of rows) {
    const result = ambientDeclarations(packages, undefined, installed);
    assert.deepEqual(linesOf(result).slice(0, H.length), H);
    assert.deepEqual(linesOf(result).slice(H.length, H.length + NODE.length), NODE);
    assert.deepEqual(packageLinesOf(result), lines);
  }
});

test("[boundary-5] installed names match whole package names, case and all", () => {
  const result = ambientDeclarations(
    ["@acme/sdk", "Zod"],
    undefined,
    new Set(["@acme", "zod"]),
  );
  const lines = linesOf(result);
  assert.ok(lines.includes('declare module "@acme/sdk";'));
  assert.ok(lines.includes('declare module "@acme/sdk/*";'));
  assert.ok(lines.includes('declare module "Zod";'));
  assert.ok(lines.includes('declare module "Zod/*";'));
  assert.deepEqual(
    lines.filter((line) => line.endsWith('*";')),
    ['declare module "node:*";', 'declare module "@acme/sdk/*";', 'declare module "Zod/*";'],
  );
});

test("[boundary-6] a module text for an installed package replaces its pattern and is appended as given", () => {
  const text = 'declare module "zod" {\n  export const z: any;\n}\n';
  const result = ambientDeclarations(
    ["zod"],
    { specifiers: ["zod"], text },
    new Set(["zod"]),
  );
  const lines = linesOf(result);
  assert.equal(lines.includes('declare module "zod";'), false);
  assert.equal(lines.includes('declare module "zod/*";'), false);
  assert.equal(lines.includes('declare module "zod*";'), false);
  assert.equal(result, `${[...H, ...NODE].join("\n")}\n${text}`);
});

test("[boundary-7] the arguments are not mutated and repeated calls agree", () => {
  const packages = ["zod", "pg"];
  const installed = new Set(["zod"]);
  const modules = { specifiers: ["pg"], text: 'declare module "pg" {}\n' };
  const first = ambientDeclarations(packages, modules, installed);
  const second = ambientDeclarations(packages, modules, installed);
  assert.equal(first, second);
  assert.deepEqual(packages, ["zod", "pg"]);
  assert.deepEqual([...installed], ["zod"]);
  assert.deepEqual(modules, { specifiers: ["pg"], text: 'declare module "pg" {}\n' });
  assert.equal(NODE_GLOBAL_DECLARATIONS.length, 81);
});
