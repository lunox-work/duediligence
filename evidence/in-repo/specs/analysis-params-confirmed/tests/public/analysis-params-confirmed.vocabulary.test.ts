import assert from "node:assert/strict";
import { test } from "node:test";

import * as analysis from "../src/analysis.js";
import {
  ANALYSIS_ERROR_CODES,
  ANALYSIS_STATUSES,
  ARTIFACT_KINDS,
  GRAPHIFY_TOOL_VERSION,
  canonicalJson,
  expiredAnalysis,
  type AnalysisParams,
} from "../src/analysis.js";
import { normalizeHandle } from "../src/handle.js";
import * as core from "../src/index.js";

/**
 * The analysis vocabulary: the closed lists, the pinned tool version, the
 * parameters type and the package entry point's re-export of the module.
 */

// The entry point does not re-export the module until the change lands, so
// its names are looked up by string rather than imported by name.
const entry = core as unknown as Record<string, unknown>;

test("[happy-1] each vocabulary list holds the ticket's values in the ticket's order", () => {
  assert.deepEqual(ANALYSIS_STATUSES, ["queued", "running", "succeeded", "failed"]);
  assert.deepEqual(ANALYSIS_ERROR_CODES, [
    "too_large",
    "too_many_files",
    "source_unavailable",
    "tool_failed",
    "tool_timeout",
    "upload_failed",
    "worker_lost",
    "cancelled",
  ]);
  assert.deepEqual(ARTIFACT_KINDS, [
    "graph_json",
    "graph_html",
    "report_md",
    "wiki_page",
    "manifest",
    "other",
  ]);
});

test("[happy-1] the vocabulary lists are plain arrays, not frozen at runtime", () => {
  for (const list of [ANALYSIS_STATUSES, ANALYSIS_ERROR_CODES, ARTIFACT_KINDS]) {
    assert.equal(Array.isArray(list), true);
    assert.equal(Object.isFrozen(list), false);
  }
});

test("[happy-2] the tool version is pinned", () => {
  assert.equal(GRAPHIFY_TOOL_VERSION, "graphifyy@0.4.18+driver-1");
});

test("[happy-2] the tool version is a primitive string, not a String object", () => {
  assert.equal(typeof GRAPHIFY_TOOL_VERSION, "string");
  assert.equal(GRAPHIFY_TOOL_VERSION.length, "graphifyy@0.4.18+driver-1".length);
});

test("[happy-3] the package entry point re-exports the module's values", () => {
  assert.equal(entry["ANALYSIS_STATUSES"], ANALYSIS_STATUSES);
  assert.equal(entry["ANALYSIS_ERROR_CODES"], ANALYSIS_ERROR_CODES);
  assert.equal(entry["ARTIFACT_KINDS"], ARTIFACT_KINDS);
  assert.equal(entry["GRAPHIFY_TOOL_VERSION"], GRAPHIFY_TOOL_VERSION);
  assert.equal(entry["expiredAnalysis"], expiredAnalysis);
  assert.equal(entry["canonicalJson"], canonicalJson);
});

test("[happy-3] the re-export keeps the existing exports and adds no type-only names", () => {
  assert.equal(entry["normalizeHandle"], normalizeHandle);
  assert.equal("AnalysisParams" in entry, false);
});

test("[happy-4] a value typed AnalysisParams carries its deadline in minutes", () => {
  const params: AnalysisParams = { deadlineMinutes: 30 };
  assert.equal(params.deadlineMinutes, 30);
});

test("[happy-4] AnalysisParams is a type only, with no runtime counterpart", () => {
  assert.equal("AnalysisParams" in analysis, false);
  // @ts-expect-error deadlineMinutes is required.
  const missing: AnalysisParams = {};
  assert.deepEqual(missing, {});
  const params: AnalysisParams = { deadlineMinutes: 0 };
  // @ts-expect-error deadlineMinutes is readonly.
  params.deadlineMinutes = 1;
});
