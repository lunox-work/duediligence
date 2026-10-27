import assert from "node:assert/strict";
import { test } from "node:test";

import * as analysis from "../src/analysis.js";
import {
  ANALYSIS_ERROR_CODES,
  ANALYSIS_STATUSES,
  type AnalysisErrorCode,
  type AnalysisParams,
  type AnalysisStatus,
  ARTIFACT_KINDS,
  type ArtifactKind,
  canonicalJson,
  expiredAnalysis,
  GRAPHIFY_TOOL_VERSION,
} from "../src/analysis.js";
import { validateRateCard } from "../src/bounty.js";
import { normalizeHandle } from "../src/handle.js";
import * as core from "../src/index.js";

/**
 * The analysis vocabulary, the watchdog's retry rule and the canonical JSON
 * encoding. Every scenario of `spec.md` is pinned by a test whose name starts
 * with its key.
 */

const ATTEMPT_MESSAGE = "attempt must be a positive safe integer";
const MAX_ATTEMPTS_MESSAGE = "maxAttempts must be a positive safe integer";

function assertRangeError(fn: () => unknown, message: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof RangeError, `expected a RangeError, got ${String(error)}`);
    assert.equal(error.message, message);
    return true;
  });
}

function assertTypeError(fn: () => unknown, message: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof TypeError, `expected a TypeError, got ${String(error)}`);
    assert.equal(error.message, message);
    return true;
  });
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

// Vocabulary

test("[happy-1] each vocabulary list holds the ticket's values in the ticket's order", () => {
  assert.deepEqual([...ANALYSIS_STATUSES], ["queued", "running", "succeeded", "failed"]);
  assert.deepEqual(
    [...ANALYSIS_ERROR_CODES],
    [
      "too_large",
      "too_many_files",
      "source_unavailable",
      "tool_failed",
      "tool_timeout",
      "upload_failed",
      "worker_lost",
      "cancelled",
    ],
  );
  assert.deepEqual(
    [...ARTIFACT_KINDS],
    ["graph_json", "graph_html", "report_md", "wiki_page", "manifest", "other"],
  );
  // The element types are the lists' members.
  const status: AnalysisStatus = ANALYSIS_STATUSES[0];
  const code: AnalysisErrorCode = "worker_lost";
  const kind: ArtifactKind = "manifest";
  assert.ok(ANALYSIS_STATUSES.includes(status));
  assert.ok(ANALYSIS_ERROR_CODES.includes(code));
  assert.ok(ARTIFACT_KINDS.includes(kind));
});

test("[happy-1] the vocabulary lists are plain arrays, not frozen at runtime", () => {
  for (const list of [ANALYSIS_STATUSES, ANALYSIS_ERROR_CODES, ARTIFACT_KINDS]) {
    assert.ok(Array.isArray(list));
    assert.equal(Object.isFrozen(list), false);
  }
});

test("[happy-2] the tool version is pinned", () => {
  assert.equal(GRAPHIFY_TOOL_VERSION, "graphifyy@0.4.18+driver-1");
});

test("[happy-2] the tool version is a primitive string", () => {
  assert.equal(typeof GRAPHIFY_TOOL_VERSION, "string");
});

test("[happy-3] the package entry point re-exports the analysis values", () => {
  const exported = core as unknown as Record<string, unknown>;
  assert.equal(exported["ANALYSIS_STATUSES"], ANALYSIS_STATUSES);
  assert.equal(exported["ANALYSIS_ERROR_CODES"], ANALYSIS_ERROR_CODES);
  assert.equal(exported["ARTIFACT_KINDS"], ARTIFACT_KINDS);
  assert.equal(exported["GRAPHIFY_TOOL_VERSION"], GRAPHIFY_TOOL_VERSION);
  assert.equal(exported["expiredAnalysis"], expiredAnalysis);
  assert.equal(exported["canonicalJson"], canonicalJson);
});

test("[happy-3] the entry point keeps its existing exports alongside the new ones", () => {
  const exported = core as unknown as Record<string, unknown>;
  assert.equal(exported["normalizeHandle"], normalizeHandle);
  assert.equal(exported["validateRateCard"], validateRateCard);
  assert.equal(exported["canonicalJson"], canonicalJson);
});

test("[happy-4] AnalysisParams takes a deadline in minutes", () => {
  const params: AnalysisParams = { deadlineMinutes: 30 };
  assert.equal(params.deadlineMinutes, 30);
});

test("[happy-4] AnalysisParams is a type only, with no runtime counterpart", () => {
  assert.equal("AnalysisParams" in analysis, false);
  assert.equal("AnalysisParams" in core, false);
});

// expiredAnalysis

test("[happy-5] the watchdog requeues while attempts remain and fails the last attempt", () => {
  assert.deepEqual(expiredAnalysis(1, 3), { status: "queued", attempt: 2 });
  assert.deepEqual(expiredAnalysis(2, 3), { status: "queued", attempt: 3 });
  assert.deepEqual(expiredAnalysis(3, 3), { status: "failed", attempt: 3 });
});

test("[happy-5] the watchdog's decision does not depend on earlier calls", () => {
  assert.deepEqual(expiredAnalysis(3, 3), { status: "failed", attempt: 3 });
  assert.deepEqual(expiredAnalysis(1, 3), { status: "queued", attempt: 2 });
  assert.deepEqual(expiredAnalysis(3, 3), { status: "failed", attempt: 3 });
  assert.deepEqual(expiredAnalysis(2, 3), { status: "queued", attempt: 3 });
});

test("[boundary-1] attempts at a small or lowered limit", () => {
  assert.deepEqual(expiredAnalysis(1, 1), { status: "failed", attempt: 1 });
  assert.deepEqual(expiredAnalysis(1, 2), { status: "queued", attempt: 2 });
  // The limit was lowered after the analysis ran past it: fail, not reject.
  assert.deepEqual(expiredAnalysis(5, 3), { status: "failed", attempt: 5 });
});

test("[boundary-1] attempts at the largest safe integer", () => {
  assert.deepEqual(expiredAnalysis(Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER), {
    status: "queued",
    attempt: Number.MAX_SAFE_INTEGER,
  });
  assert.deepEqual(expiredAnalysis(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), {
    status: "failed",
    attempt: Number.MAX_SAFE_INTEGER,
  });
});

test("[boundary-2] each expiredAnalysis call returns a new object", () => {
  const first = expiredAnalysis(1, 3);
  const second = expiredAnalysis(1, 3);
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
});

test("[boundary-2] changing one result does not affect a later call", () => {
  const first = expiredAnalysis(1, 3);
  first.attempt = 99;
  first.status = "failed";
  assert.deepEqual(expiredAnalysis(1, 3), { status: "queued", attempt: 2 });
});

test("[unhappy-1] an attempt that is not a positive integer is refused", () => {
  for (const attempt of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assertRangeError(() => expiredAnalysis(attempt, 3), ATTEMPT_MESSAGE);
  }
});

test("[unhappy-1] an attempt just past the largest safe integer is refused", () => {
  assertRangeError(() => expiredAnalysis(Number.MAX_SAFE_INTEGER + 1, 3), ATTEMPT_MESSAGE);
});

test("[unhappy-2] a maxAttempts that is not a positive integer is refused", () => {
  for (const maxAttempts of [0, -3, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assertRangeError(() => expiredAnalysis(1, maxAttempts), MAX_ATTEMPTS_MESSAGE);
  }
});

test("[unhappy-2] a maxAttempts just past the largest safe integer is refused", () => {
  assertRangeError(
    () => expiredAnalysis(1, Number.MAX_SAFE_INTEGER + 1),
    MAX_ATTEMPTS_MESSAGE,
  );
});

test("[unhappy-3] when both arguments are invalid, the attempt is reported", () => {
  assertRangeError(() => expiredAnalysis(0, 0), ATTEMPT_MESSAGE);
});

test("[unhappy-3] the attempt is reported for any pair of invalid arguments", () => {
  assertRangeError(() => expiredAnalysis(Number.NaN, -1), ATTEMPT_MESSAGE);
  assertRangeError(() => expiredAnalysis(1.5, Number.POSITIVE_INFINITY), ATTEMPT_MESSAGE);
});

// canonicalJson

test("[happy-6] values are written as compact JSON with sorted keys", () => {
  assert.equal(canonicalJson(null), "null");
  assert.equal(canonicalJson(true), "true");
  assert.equal(canonicalJson(42), "42");
  assert.equal(canonicalJson("héllo"), '"héllo"');
  assert.equal(canonicalJson([3, 1, 2]), "[3,1,2]");
  assert.equal(canonicalJson({ b: 1, a: [true, null], c: "x" }), '{"a":[true,null],"b":1,"c":"x"}');
  assert.equal(canonicalJson({ z: { y: 1, x: 2 }, a: [] }), '{"a":[],"z":{"x":2,"y":1}}');
  assert.equal(canonicalJson({}), "{}");
});

test("[happy-6] empty containers and false are written compactly", () => {
  assert.equal(canonicalJson([]), "[]");
  assert.equal(canonicalJson(false), "false");
  assert.equal(canonicalJson([[], {}, [{}]]), "[[],{},[{}]]");
  assert.equal(canonicalJson(""), '""');
});

test("[happy-7] key order in the input does not change the output", () => {
  const a = { b: 1, a: [true, null], c: "x" };
  const b = { c: "x", a: [true, null], b: 1 };
  assert.equal(canonicalJson(a), '{"a":[true,null],"b":1,"c":"x"}');
  assert.equal(canonicalJson(b), '{"a":[true,null],"b":1,"c":"x"}');
});

test("[happy-7] key order in nested objects does not change the output", () => {
  const a = { z: [{ q: 1, p: 2 }], y: { n: 1, m: { l: 1, k: 2 } } };
  const b = { y: { m: { k: 2, l: 1 }, n: 1 }, z: [{ p: 2, q: 1 }] };
  assert.equal(canonicalJson(a), '{"y":{"m":{"k":2,"l":1},"n":1},"z":[{"p":2,"q":1}]}');
  assert.equal(canonicalJson(b), canonicalJson(a));
});

test("[happy-8] the input is not modified", () => {
  const input = { b: [2, 1], a: { d: 1, c: 2 } };
  canonicalJson(input);
  assert.deepEqual(Object.keys(input), ["b", "a"]);
  assert.deepEqual(input.b, [2, 1]);
  assert.deepEqual(Object.keys(input.a), ["d", "c"]);
});

test("[happy-8] a deeply frozen input is encoded without being modified", () => {
  const input = deepFreeze({ b: [2, 1], a: { d: 1, c: 2 } });
  assert.equal(canonicalJson(input), '{"a":{"c":2,"d":1},"b":[2,1]}');
  assert.equal(canonicalJson(input), '{"a":{"c":2,"d":1},"b":[2,1]}');
  assert.deepEqual(Object.keys(input), ["b", "a"]);
});

test("[boundary-3] keys sort by UTF-16 code unit, not numerically or by code point", () => {
  const value: Record<string, number> = {};
  value["b"] = 1;
  value["a"] = 2;
  value["B"] = 3;
  value["10"] = 4;
  value["9"] = 5;
  value["ｚ"] = 6;
  value["😀"] = 7;
  value["é"] = 8;
  assert.equal(canonicalJson(value), '{"10":4,"9":5,"B":3,"a":2,"b":1,"é":8,"😀":7,"ｚ":6}');
});

test("[boundary-3] code-unit order holds for integer-like and astral keys at any depth", () => {
  assert.equal(canonicalJson({ "9": 1, "10": 2 }), '{"10":2,"9":1}');
  assert.equal(canonicalJson({ "ｚ": 1, "😀": 2 }), '{"😀":2,"ｚ":1}');
  assert.equal(
    canonicalJson([{ outer: { "9": 1, "10": 2, "ｚ": 3, "😀": 4 } }]),
    '[{"outer":{"10":2,"9":1,"😀":4,"ｚ":3}}]',
  );
});

test("[boundary-4] numbers and strings are written as JSON.stringify writes them", () => {
  assert.equal(canonicalJson(-0), "0");
  assert.equal(canonicalJson(1e21), "1e+21");
  assert.equal(canonicalJson(0.1 + 0.2), "0.30000000000000004");
  assert.equal(canonicalJson("\u0001"), '"\\u0001"');
  assert.equal(canonicalJson('a"b\\c\n'), '"a\\"b\\\\c\\n"');
  assert.equal(canonicalJson("\ud800"), '"\\ud800"');
});

test("[boundary-4] nested numbers and strings match JSON.stringify", () => {
  const values: unknown[] = [-0, 1e21, 5e-7, -1.5, "é😀", "\udc00", "\t\u001f", " "];
  for (const value of values) {
    assert.equal(canonicalJson(value), JSON.stringify(value));
    assert.equal(canonicalJson([value]), JSON.stringify([value]));
    assert.equal(canonicalJson({ k: value }), JSON.stringify({ k: value }));
  }
});

test("[boundary-5] object properties whose value is undefined are left out", () => {
  assert.equal(canonicalJson({ b: undefined, a: 1 }), '{"a":1}');
});

test("[boundary-5] an object whose only properties are undefined is written empty", () => {
  assert.equal(canonicalJson({ u: undefined }), "{}");
  assert.equal(canonicalJson({ o: { u: undefined }, a: [{ v: undefined, w: 0 }] }), '{"a":[{"w":0}],"o":{}}');
});

test("[boundary-6] an object with no prototype is accepted", () => {
  const o = Object.create(null) as Record<string, number>;
  o["b"] = 2;
  o["a"] = 1;
  assert.equal(canonicalJson(o), '{"a":1,"b":2}');
});

test("[boundary-6] a nested object with no prototype is accepted", () => {
  const o = Object.create(null) as Record<string, unknown>;
  o["y"] = Object.create(null);
  o["x"] = [1];
  assert.equal(canonicalJson([o]), '[{"x":[1],"y":{}}]');
});

test("[boundary-7] symbol keys and extra array properties are ignored", () => {
  const o = { a: 1, [Symbol("s")]: 2 };
  const arr = Object.assign([1, 2], { extra: 3 });
  assert.equal(canonicalJson(o), '{"a":1}');
  assert.equal(canonicalJson(arr), "[1,2]");
});

test("[boundary-7] non-enumerable and nested symbol-keyed properties are ignored", () => {
  const o: Record<string, unknown> = { a: 1 };
  Object.defineProperty(o, "hidden", { value: 2, enumerable: false });
  const nested = { list: Object.assign([{ [Symbol("t")]: 1, k: 1 }], { extra: [9] }) };
  assert.equal(canonicalJson(o), '{"a":1}');
  assert.equal(canonicalJson(nested), '{"list":[{"k":1}]}');
});

test("[boundary-8] a value shared by two branches but not cyclic is written at both places", () => {
  const shared = { k: 1 };
  assert.equal(canonicalJson({ x: shared, y: [shared] }), '{"x":{"k":1},"y":[{"k":1}]}');
});

test("[boundary-8] an array shared by siblings is written at each place", () => {
  const shared = [1, { k: 2 }];
  assert.equal(canonicalJson([shared, shared, { s: shared }]), '[[1,{"k":2}],[1,{"k":2}],{"s":[1,{"k":2}]}]');
});

test("[unhappy-4] top-level values that are not plain data are refused", () => {
  assertTypeError(() => canonicalJson(undefined), "canonicalJson cannot encode undefined");
  assertTypeError(() => canonicalJson(() => 1), "canonicalJson cannot encode a function");
  assertTypeError(() => canonicalJson(Symbol("s")), "canonicalJson cannot encode a symbol");
  assertTypeError(() => canonicalJson(10n), "canonicalJson cannot encode a bigint");
  assertTypeError(() => canonicalJson(Number.NaN), "canonicalJson cannot encode a non-finite number");
  assertTypeError(() => canonicalJson(new Date(0)), "canonicalJson cannot encode a non-plain object");
  assertTypeError(() => canonicalJson(new Map()), "canonicalJson cannot encode a non-plain object");
  assertTypeError(() => canonicalJson(new String("x")), "canonicalJson cannot encode a non-plain object");
});

test("[unhappy-4] nested values that are not plain data are refused, toJSON included", () => {
  assertTypeError(() => canonicalJson([1, undefined]), "canonicalJson cannot encode undefined");
  assertTypeError(() => canonicalJson([1, , 3]), "canonicalJson cannot encode undefined");
  assertTypeError(() => canonicalJson({ f: () => 1 }), "canonicalJson cannot encode a function");
  assertTypeError(() => canonicalJson({ n: 10n }), "canonicalJson cannot encode a bigint");
  assertTypeError(() => canonicalJson([Infinity]), "canonicalJson cannot encode a non-finite number");
  assertTypeError(
    () => canonicalJson({ n: -Infinity }),
    "canonicalJson cannot encode a non-finite number",
  );
  assertTypeError(() => canonicalJson({ d: new Date(0) }), "canonicalJson cannot encode a non-plain object");
  assertTypeError(() => canonicalJson({ toJSON: () => 1 }), "canonicalJson cannot encode a function");
});

test("[unhappy-5] a cyclic structure is refused", () => {
  const o: Record<string, unknown> = { a: 1 };
  o["self"] = o;
  assertTypeError(() => canonicalJson(o), "canonicalJson cannot encode a cyclic structure");
});

test("[unhappy-5] a cycle two objects deep is refused", () => {
  const o: Record<string, unknown> = { a: 1 };
  o["inner"] = { back: { to: o } };
  assertTypeError(() => canonicalJson(o), "canonicalJson cannot encode a cyclic structure");
});

test("[unhappy-6] a cycle through an array is refused", () => {
  const arr: unknown[] = [];
  arr.push(arr);
  assertTypeError(() => canonicalJson(arr), "canonicalJson cannot encode a cyclic structure");
});

test("[unhappy-6] a cycle from an object through an array back to it is refused", () => {
  const o: { list: unknown[] } = { list: [] };
  o.list.push(1, o);
  assertTypeError(() => canonicalJson(o), "canonicalJson cannot encode a cyclic structure");
});
