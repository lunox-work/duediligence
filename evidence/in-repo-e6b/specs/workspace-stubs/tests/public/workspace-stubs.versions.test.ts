import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ABSTRACTIONS_TOOL_VERSION,
  ANALYSIS_TOOLS,
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
import { NODE_GLOBAL_DECLARATIONS } from "../src/sandbox/project.js";

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

test("[happy-1] toolVersionOf reports the bumped slice and sandbox-build versions and the rest unchanged", () => {
  const expected: Record<string, string> = {
    slice: "slice@4",
    sandbox_build: "sandbox_build@9",
    graphify: "graphifyy@0.4.18+driver-1",
    abstractions: "abstractions@3",
    data_model: "data_model@1",
    documents: "documents@1",
    brief: "brief@1",
    scope: "scope@5",
    fixtures: "fixtures@3",
    sandbox_starter: "sandbox_starter@4",
  };
  for (const [tool, version] of Object.entries(expected))
    assert.equal(
      toolVersionOf(tool as (typeof ANALYSIS_TOOLS)[number]),
      version,
      tool,
    );
  assert.equal(SLICE_TOOL_VERSION, "slice@4");
  assert.equal(SANDBOX_BUILD_RUN_VERSION, "sandbox_build@9");
});

test("[happy-1] only the slice and sandbox-build constants move; every other constant keeps its value and matches toolVersionOf", () => {
  assert.notEqual(SLICE_TOOL_VERSION, "slice@3");
  assert.notEqual(SANDBOX_BUILD_RUN_VERSION, "sandbox_build@8");
  assert.equal(toolVersionOf("slice"), SLICE_TOOL_VERSION);
  assert.equal(toolVersionOf("sandbox_build"), SANDBOX_BUILD_RUN_VERSION);
  // The starter's call passes no installed set, so its version stays.
  assert.equal(STARTER_TOOL_VERSION, "sandbox_starter@4");
  assert.equal(toolVersionOf("sandbox_starter"), STARTER_TOOL_VERSION);
  assert.equal(GRAPHIFY_TOOL_VERSION, "graphifyy@0.4.18+driver-1");
  assert.equal(ABSTRACTIONS_TOOL_VERSION, "abstractions@3");
  assert.equal(DATA_MODEL_TOOL_VERSION, "data_model@1");
  assert.equal(DOCUMENTS_TOOL_VERSION, "documents@1");
  assert.equal(BRIEF_TOOL_VERSION, "brief@1");
  assert.equal(SCOPE_TOOL_VERSION, "scope@5");
  assert.equal(FIXTURES_TOOL_VERSION, "fixtures@3");
});

test("[happy-2] NODE_GLOBAL_DECLARATIONS holds the 16 Node globals in order", () => {
  assert.equal(NODE_GLOBAL_DECLARATIONS.length, 16);
  assert.equal(NODE_GLOBAL_DECLARATIONS[0], "declare var process: any;");
  assert.equal(NODE_GLOBAL_DECLARATIONS[9], "declare var console: any;");
  assert.equal(
    NODE_GLOBAL_DECLARATIONS[15],
    "declare function structuredClone<T>(value: T): T;",
  );
  for (const entry of NODE_GLOBAL_DECLARATIONS) {
    assert.equal(entry.startsWith("declare module"), false, entry);
    assert.equal(entry.includes("\n"), false, entry);
  }
});

test("[happy-2] NODE_GLOBAL_DECLARATIONS is exactly the listed text, without the node:* module, and not frozen", () => {
  assert.deepEqual([...NODE_GLOBAL_DECLARATIONS], NODE_GLOBALS);
  assert.equal(
    NODE_GLOBAL_DECLARATIONS.includes('declare module "node:*";'),
    false,
  );
  assert.equal(Object.isFrozen(NODE_GLOBAL_DECLARATIONS), false);
});
