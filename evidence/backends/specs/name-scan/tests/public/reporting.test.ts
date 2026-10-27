import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../../src/index.js";

test("[happy-3] reports the source path original term exact text and one-based location", () => {
  assert.deepEqual(scan(["Harbor-Lights"], [{
    path: "src/readme.txt",
    text: "prefix Harbor.Lights suffix",
  }]), {
    matches: [
      { path: "src/readme.txt", term: "Harbor-Lights", line: 1, column: 8, text: "Harbor.Lights" },
    ],
    skipped: [],
  });
});

test("[happy-3] counts UTF-16 units and literal tabs after empty CRLF lines", () => {
  assert.deepEqual(scan(["harbor-lights"], [{
    path: "notes.txt",
    text: "\r\n😀 \tHarbor.Lights\r\n\r\nharborLights\r\n",
  }]).matches, [
    { path: "notes.txt", term: "harbor-lights", line: 2, column: 5, text: "Harbor.Lights" },
    { path: "notes.txt", term: "harbor-lights", line: 4, column: 1, text: "harborLights" },
  ]);
});

test("[happy-4] reports a path match on line zero when the file text is empty", () => {
  assert.deepEqual(scan(["harbor-lights"], [{
    path: "packages/harbor-lights/src/index.ts",
    text: "",
  }]), {
    matches: [
      { path: "packages/harbor-lights/src/index.ts", term: "harbor-lights", line: 0, column: 10, text: "harbor-lights" },
    ],
    skipped: [],
  });
});

test("[happy-4] counts UTF-16 path columns and matches words joined by a path separator", () => {
  assert.deepEqual(scan(["harbor-lights"], [{
    path: "😀/Harbor/Lights.txt",
    text: "",
  }]).matches, [
    { path: "😀/Harbor/Lights.txt", term: "harbor-lights", line: 0, column: 4, text: "Harbor/Lights" },
  ]);
});

test("[boundary-4] keeps the longer match when terms share a start", () => {
  assert.deepEqual(scan(["harbor", "harbor lights"], [{
    path: "notes.txt",
    text: "harborLights",
  }]).matches, [
    { path: "notes.txt", term: "harbor lights", line: 1, column: 1, text: "harborLights" },
  ]);
});

test("[boundary-4] a longer overlapping span wins even when it starts later", () => {
  assert.deepEqual(scan(["harbor lights", "lights festival"], [{
    path: "notes.txt",
    text: "harborLights-----festival",
  }]).matches, [
    { path: "notes.txt", term: "lights festival", line: 1, column: 7, text: "Lights-----festival" },
  ]);
});

test("[boundary-4] equal-length overlaps use the first term in the supplied list", () => {
  const files = [{ path: "notes.txt", text: "harborLights" }];
  assert.deepEqual(scan(["harbor-lights", "HARBOR LIGHTS"], files).matches, [
    { path: "notes.txt", term: "harbor-lights", line: 1, column: 1, text: "harborLights" },
  ]);
  assert.deepEqual(scan(["HARBOR LIGHTS", "harbor-lights"], files).matches, [
    { path: "notes.txt", term: "HARBOR LIGHTS", line: 1, column: 1, text: "harborLights" },
  ]);
});

test("[boundary-4] retains nonoverlapping matches including directly adjacent identifier words", () => {
  assert.deepEqual(scan(["harbor", "harbor lights"], [{
    path: "notes.txt",
    text: "harborLightsHarbor",
  }]).matches, [
    { path: "notes.txt", term: "harbor lights", line: 1, column: 1, text: "harborLights" },
    { path: "notes.txt", term: "harbor", line: 1, column: 13, text: "Harbor" },
  ]);
});

test("[happy-5] sorts by path then line then column regardless of file and term input order", () => {
  assert.deepEqual(scan(["lights", "harbor"], [
    { path: "z.txt", text: "harbor" },
    { path: "a.txt", text: "harbor lights\nlights harbor" },
  ]).matches, [
    { path: "a.txt", term: "harbor", line: 1, column: 1, text: "harbor" },
    { path: "a.txt", term: "lights", line: 1, column: 8, text: "lights" },
    { path: "a.txt", term: "lights", line: 2, column: 1, text: "lights" },
    { path: "a.txt", term: "harbor", line: 2, column: 8, text: "harbor" },
    { path: "z.txt", term: "harbor", line: 1, column: 1, text: "harbor" },
  ]);
});

test("[happy-5] orders path matches before text matches within the same file", () => {
  assert.deepEqual(scan(["harbor", "lights"], [{
    path: "harbor/lights.txt",
    text: "lights harbor",
  }]).matches, [
    { path: "harbor/lights.txt", term: "harbor", line: 0, column: 1, text: "harbor" },
    { path: "harbor/lights.txt", term: "lights", line: 0, column: 8, text: "lights" },
    { path: "harbor/lights.txt", term: "lights", line: 1, column: 1, text: "lights" },
    { path: "harbor/lights.txt", term: "harbor", line: 1, column: 8, text: "harbor" },
  ]);
});

test("[unhappy-1] refuses an entire NUL-containing file including its otherwise matching path", () => {
  assert.deepEqual(scan(["harbor"], [{
    path: "harbor.txt",
    text: "harbor\n\u0000\nharbor",
  }]), { matches: [], skipped: ["harbor.txt"] });
});

test("[unhappy-1] detects NUL at either text edge while continuing to scan a text file", () => {
  const result = scan(["harbor"], [
    { path: "start.bin", text: "\u0000harbor" },
    { path: "notes.txt", text: "harbor" },
    { path: "end.bin", text: "harbor\u0000" },
  ]);
  assert.deepEqual(result.matches, [
    { path: "notes.txt", term: "harbor", line: 1, column: 1, text: "harbor" },
  ]);
  // The specification does not prescribe an order for skipped paths.
  assert.deepEqual([...result.skipped].sort(), ["end.bin", "start.bin"]);
});
