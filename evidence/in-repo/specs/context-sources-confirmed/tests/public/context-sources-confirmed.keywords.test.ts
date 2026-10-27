import assert from "node:assert/strict";
import { test } from "node:test";

import { contextKeywords } from "../src/sources.js";

test("[happy-3] titles become keywords", () => {
  const cases: [string, string[]][] = [
    ["Fix login redirect for SSO users", ["login", "redirect", "users"]],
    [
      "Add dark-mode toggle to settings_page",
      ["dark", "mode", "toggle", "settings", "page"],
    ],
    ["Überprüfung der Zahlungen", ["berpr", "fung", "zahlungen"]],
    ["Billing/Invoices: export.CSV", ["billing", "invoices", "export"]],
  ];
  for (const [title, keywords] of cases) {
    assert.deepEqual(contextKeywords(title), keywords, title);
  }
});

test("[happy-3] keywords have no cap and the returned list is a new array", () => {
  const words = Array.from({ length: 40 }, (_, index) => `word${index}`);
  const title = words.join(" ");
  const first = contextKeywords(title);
  assert.deepEqual(first, words);
  first.push("changed");
  first[0] = "other";
  assert.deepEqual(contextKeywords(title), words);
});

test("[boundary-1] short words and repeats are dropped", () => {
  const cases: [string, string[]][] = [
    ["Upgrade to v2 of API 2024", ["upgrade", "2024"]],
    ["Cache cache CACHE", ["cache"]],
    ["abc abcd", ["abcd"]],
    ["the and with from", ["with", "from"]],
    ["", []],
    ["   --- !!! ...", []],
  ];
  for (const [title, keywords] of cases) {
    assert.deepEqual(contextKeywords(title), keywords, JSON.stringify(title));
  }
});

test("[boundary-1] a repeat keeps its first-seen position and digit-only words count", () => {
  assert.deepEqual(contextKeywords("beta alpha 1234 BETA 123 alpha"), [
    "beta",
    "alpha",
    "1234",
  ]);
});
