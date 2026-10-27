import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../../src/index.js";
import type { Match, ScanFile } from "../../src/index.js";

/** Scans and returns the matches with only the spec's fields, and the skipped paths. */
function run(terms: string[], files: ScanFile[]) {
  const result = scan(terms, files);
  return {
    matches: result.matches.map((m: Match) => ({
      path: m.path,
      term: m.term,
      line: m.line,
      column: m.column,
      text: m.text,
    })),
    skipped: result.skipped,
  };
}

test("a match reports path, term as given, line, column and text as written", () => {
  const text = "# Title\n\nSee the  harbor-lights project.\n";
  assert.deepEqual(run(["Harbor_Lights"], [{ path: "docs/readme.md", text }]), {
    matches: [
      { path: "docs/readme.md", term: "Harbor_Lights", line: 3, column: 10, text: "harbor-lights" },
    ],
    skipped: [],
  });
});

test("columns count UTF-16 code units", () => {
  const text = "\u{1F600}\u{1F600} nimbus\n—é Nimbus\n\t\tNIMBUS";
  assert.deepEqual(run(["nimbus"], [{ path: "x.md", text }]).matches, [
    { path: "x.md", term: "nimbus", line: 1, column: 6, text: "nimbus" },
    { path: "x.md", term: "nimbus", line: 2, column: 4, text: "Nimbus" },
    { path: "x.md", term: "nimbus", line: 3, column: 3, text: "NIMBUS" },
  ]);
});

test("lines are split at newlines and a trailing carriage return is not part of the line", () => {
  const text = "first line\r\nharborLights\r\nend harbor-lights\r\n\r\n  HARBOR_LIGHTS\r\n";
  assert.deepEqual(run(["harbor-lights"], [{ path: "w.txt", text }]).matches, [
    { path: "w.txt", term: "harbor-lights", line: 2, column: 1, text: "harborLights" },
    { path: "w.txt", term: "harbor-lights", line: 3, column: 5, text: "harbor-lights" },
    { path: "w.txt", term: "harbor-lights", line: 5, column: 3, text: "HARBOR_LIGHTS" },
  ]);
});

test("a term in the packages/harbor-lights path is reported on line 0", () => {
  const path = "packages/harbor-lights/src/index.ts";
  assert.deepEqual(run(["harbor-lights"], [{ path, text: "export {};\n" }]), {
    matches: [{ path, term: "harbor-lights", line: 0, column: 10, text: "harbor-lights" }],
    skipped: [],
  });
});

test("every spelling of a term in a path is reported, before the file's own lines", () => {
  const path = "src/HarborLights/HARBOR_LIGHTS.tsx";
  const text = "import x from './harbor.lights';";
  assert.deepEqual(run(["harbor lights"], [{ path, text }]).matches, [
    { path, term: "harbor lights", line: 0, column: 5, text: "HarborLights" },
    { path, term: "harbor lights", line: 0, column: 18, text: "HARBOR_LIGHTS" },
    { path, term: "harbor lights", line: 1, column: 18, text: "harbor.lights" },
  ]);
});

test("a path match is reported for a file with empty text", () => {
  const path = "assets/nimbus-logo.svg";
  assert.deepEqual(run(["Nimbus"], [{ path, text: "" }]).matches, [
    { path, term: "Nimbus", line: 0, column: 8, text: "nimbus" },
  ]);
});

test("each matched text is reported exactly as written, separators included", () => {
  const text = "a = Silver__Fern--CLOUD;";
  assert.deepEqual(run(["silver fern cloud"], [{ path: "k.ts", text }]).matches, [
    { path: "k.ts", term: "silver fern cloud", line: 1, column: 5, text: "Silver__Fern--CLOUD" },
  ]);
});

test("a scan with no matching text reports no matches and no skipped paths", () => {
  assert.deepEqual(
    run(["harbor-lights", "nimbus"], [
      { path: "a.ts", text: "nothing here\nat all" },
      { path: "b.ts", text: "" },
    ]),
    { matches: [], skipped: [] },
  );
});
