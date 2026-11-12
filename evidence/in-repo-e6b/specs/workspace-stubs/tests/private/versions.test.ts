import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANALYSIS_TOOLS,
  SANDBOX_BUILD_RUN_VERSION,
  SLICE_TOOL_VERSION,
  toolVersionOf,
} from "../../src/analysis.js";

const VERSIONS: Readonly<Record<string, string>> = {
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

// Extends "[happy-1] toolVersionOf reports the bumped slice and sandbox-build versions and the rest unchanged":
// walks ANALYSIS_TOOLS itself, in its own order, and calls each tool twice.
test("[happy-1] every tool in ANALYSIS_TOOLS reports the version in the table, on every call", () => {
  assert.deepEqual([...ANALYSIS_TOOLS].sort(), Object.keys(VERSIONS).sort());
  for (const tool of ANALYSIS_TOOLS) {
    assert.equal(toolVersionOf(tool), VERSIONS[tool], tool);
    assert.equal(toolVersionOf(tool), VERSIONS[tool], tool);
  }
  assert.equal(
    new Set(ANALYSIS_TOOLS.map((tool) => toolVersionOf(tool))).size,
    ANALYSIS_TOOLS.length,
  );
});

// Extends "[happy-1] only the slice and sandbox-build constants move; every other constant keeps its value and matches toolVersionOf":
// the two bumped constants are exactly the new strings, read after the other tools.
test("[happy-1] the bumped constants are exactly slice@4 and sandbox_build@9 whatever was asked before", () => {
  for (const tool of [...ANALYSIS_TOOLS].reverse()) toolVersionOf(tool);
  assert.equal(SLICE_TOOL_VERSION, "slice@4");
  assert.equal(SANDBOX_BUILD_RUN_VERSION, "sandbox_build@9");
  assert.equal(toolVersionOf("sandbox_build"), "sandbox_build@9");
  assert.equal(toolVersionOf("slice"), "slice@4");
});
