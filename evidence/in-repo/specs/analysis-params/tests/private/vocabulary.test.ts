import assert from "node:assert/strict";
import { test } from "node:test";

import * as analysis from "../../src/analysis.js";
import {
  ANALYSIS_ERROR_CODES,
  ANALYSIS_STATUSES,
  type AnalysisParams,
  ARTIFACT_KINDS,
  canonicalJson,
  expiredAnalysis,
  GRAPHIFY_TOOL_VERSION,
} from "../../src/analysis.js";
import * as bounty from "../../src/bounty.js";
import * as handle from "../../src/handle.js";
import * as core from "../../src/index.js";
import * as pricing from "../../src/pricing/index.js";
import * as repo from "../../src/repo/index.js";
import * as selection from "../../src/selection/index.js";

/**
 * The vocabulary, as the module and the package entry point export it. The
 * constants are already in place, so these tests read them through the
 * entry point, which is where other packages take them from.
 */

const exported = core as unknown as Record<string, unknown>;

const STATUSES = ["queued", "running", "succeeded", "failed"];
const ERROR_CODES = [
  "too_large",
  "too_many_files",
  "source_unavailable",
  "tool_failed",
  "tool_timeout",
  "upload_failed",
  "worker_lost",
  "cancelled",
];
const KINDS = ["graph_json", "graph_html", "report_md", "wiki_page", "manifest", "other"];

// Extends "[happy-1] each vocabulary list holds the ticket's values in the ticket's order":
// the lists as the entry point exports them, compared whole and element by element.
test("[happy-1] the entry point's lists hold exactly the ticket's values in order", () => {
  assert.deepEqual(exported["ANALYSIS_STATUSES"], STATUSES);
  assert.deepEqual(exported["ANALYSIS_ERROR_CODES"], ERROR_CODES);
  assert.deepEqual(exported["ARTIFACT_KINDS"], KINDS);
  assert.deepEqual(ANALYSIS_STATUSES, STATUSES);
  assert.deepEqual(ANALYSIS_ERROR_CODES, ERROR_CODES);
  assert.deepEqual(ARTIFACT_KINDS, KINDS);
});

// Extends "[happy-1] the vocabulary lists are plain arrays, not frozen at runtime".
test("[happy-1] the entry point's lists are plain arrays that are not frozen", () => {
  for (const name of ["ANALYSIS_STATUSES", "ANALYSIS_ERROR_CODES", "ARTIFACT_KINDS"]) {
    const list = exported[name];
    assert.ok(Array.isArray(list), `${name} is an array`);
    assert.equal(Object.getPrototypeOf(list), Array.prototype);
    assert.equal(Object.isFrozen(list), false);
  }
});

// Extends "[happy-2] the tool version is pinned": as the entry point exports it.
test("[happy-2] the entry point's tool version is pinned", () => {
  assert.equal(exported["GRAPHIFY_TOOL_VERSION"], "graphifyy@0.4.18+driver-1");
  assert.equal(GRAPHIFY_TOOL_VERSION, "graphifyy@0.4.18+driver-1");
});

// Extends "[happy-3] the package entry point re-exports the analysis values":
// the values are the same, and they behave the same when called through the entry point.
test("[happy-3] the entry point's functions are analysis.ts's and behave the same", () => {
  assert.equal(exported["expiredAnalysis"], expiredAnalysis);
  assert.equal(exported["canonicalJson"], canonicalJson);
  const viaCore = exported["expiredAnalysis"] as typeof expiredAnalysis;
  const encode = exported["canonicalJson"] as typeof canonicalJson;
  assert.deepEqual(viaCore(2, 4), { status: "queued", attempt: 3 });
  assert.equal(encode({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

// Extends "[happy-3] the entry point keeps its existing exports alongside the new ones":
// every export of every existing module, not two of them.
test("[happy-3] the entry point keeps every existing export unchanged beside the analysis names", () => {
  for (const module of [handle, bounty, selection, pricing, repo]) {
    for (const [name, value] of Object.entries(module)) {
      assert.equal(exported[name], value, `${name} is still exported unchanged`);
    }
  }
  for (const [name, value] of Object.entries(analysis)) {
    assert.equal(exported[name], value, `${name} is re-exported`);
  }
});

// Extends "[happy-4] AnalysisParams takes a deadline in minutes" and
// "[happy-4] AnalysisParams is a type only, with no runtime counterpart":
// other deadlines type-check, and the entry point that re-exports the module adds no value for it.
test("[happy-4] AnalysisParams holds any deadline and the re-exported module has no value for it", () => {
  const values: AnalysisParams[] = [{ deadlineMinutes: 30 }, { deadlineMinutes: 1 }, { deadlineMinutes: 240 }];
  assert.deepEqual(
    values.map((params) => params.deadlineMinutes),
    [30, 1, 240],
  );
  for (const name of Object.keys(analysis)) {
    assert.ok(name in core, `${name} is re-exported`);
  }
  assert.equal("AnalysisParams" in core, false);
  assert.equal("AnalysisParams" in analysis, false);
});
