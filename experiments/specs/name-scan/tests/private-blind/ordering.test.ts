import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../../src/index.js";
import type { Match } from "../../src/index.js";

function brief(m: Match) {
  return { path: m.path, term: m.term, line: m.line, column: m.column, text: m.text };
}

test("matches from several files and terms are ordered by path, then line, then column", () => {
  const result = scan(
    ["nimbus", "harbor-lights"],
    [
      { path: "zeta/b.ts", text: "\n\nNIMBUS\nharbor lights" },
      { path: "alpha/c.ts", text: "nimbus\n  harborLights nimbus\nx" },
      { path: "mid/a.ts", text: "harbor_lights = nimbus" },
    ],
  );
  assert.deepEqual(result.matches.map(brief), [
    { path: "alpha/c.ts", term: "nimbus", line: 1, column: 1, text: "nimbus" },
    { path: "alpha/c.ts", term: "harbor-lights", line: 2, column: 3, text: "harborLights" },
    { path: "alpha/c.ts", term: "nimbus", line: 2, column: 16, text: "nimbus" },
    { path: "mid/a.ts", term: "harbor-lights", line: 1, column: 1, text: "harbor_lights" },
    { path: "mid/a.ts", term: "nimbus", line: 1, column: 17, text: "nimbus" },
    { path: "zeta/b.ts", term: "nimbus", line: 3, column: 1, text: "NIMBUS" },
    { path: "zeta/b.ts", term: "harbor-lights", line: 4, column: 1, text: "harbor lights" },
  ]);
});

test("path matches come before a file's line matches, each ordered by column", () => {
  const result = scan(
    ["harbor-lights", "nimbus"],
    [
      { path: "lib/nimbus/harbor-lights.ts", text: "nimbus harborLights" },
      { path: "app/nimbus.ts", text: "" },
    ],
  );
  assert.deepEqual(result.matches.map(brief), [
    { path: "app/nimbus.ts", term: "nimbus", line: 0, column: 5, text: "nimbus" },
    { path: "lib/nimbus/harbor-lights.ts", term: "nimbus", line: 0, column: 5, text: "nimbus" },
    { path: "lib/nimbus/harbor-lights.ts", term: "harbor-lights", line: 0, column: 12, text: "harbor-lights" },
    { path: "lib/nimbus/harbor-lights.ts", term: "nimbus", line: 1, column: 1, text: "nimbus" },
    { path: "lib/nimbus/harbor-lights.ts", term: "harbor-lights", line: 1, column: 8, text: "harborLights" },
  ]);
});

test("later lines of a file come after earlier ones whatever the term order", () => {
  const text = "x\n".repeat(11) + "harbor-lights\n" + "x\n".repeat(88) + "nimbus";
  const result = scan(["nimbus", "harbor-lights"], [{ path: "big.txt", text }]);
  assert.deepEqual(result.matches.map(brief), [
    { path: "big.txt", term: "harbor-lights", line: 12, column: 1, text: "harbor-lights" },
    { path: "big.txt", term: "nimbus", line: 101, column: 1, text: "nimbus" },
  ]);
});
