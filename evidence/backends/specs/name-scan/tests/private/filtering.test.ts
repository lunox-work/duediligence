import { test } from "node:test";
import assert from "node:assert/strict";
import { scan } from "../../src/index.js";

// Extends "skips the specified short generic and numeric examples in paths and text":
// combines excluded terms with eligible terms rather than an all-excluded list.
test("[boundary-3] filters short and numeric names without suppressing eligible names", () => {
  const path = "api/core/77-88/AB/z9/Orion.txt";
  assert.deepEqual(scan(["AB", "z9", "77-88", "api", "core", "Orion"], [{
    path, text: "AB z9 77-88 api core ORION",
  }]), {
    matches: [
      { path, term: "Orion", line: 0, column: 22, text: "Orion" },
      { path, term: "Orion", line: 1, column: 22, text: "ORION" },
    ],
    skipped: [],
  });
});

// Extends "excludes every generic term ignoring case": title casing, paths,
// repetition, and a non-generic name in the same scan.
test("[boundary-3] excludes title-case generic terms in both paths and contents", () => {
  const terms = ["Admin", "Api", "App", "Client", "Core", "Demo", "Example", "Internal", "Main", "Server", "Test", "Web"];
  const files = terms.map((term) => ({ path: `${term}/${term}.txt`, text: `${term}\n${term}` }));
  files.push({ path: "notes.txt", text: "vessel" });
  assert.deepEqual(scan([...terms, "vessel"], files), {
    matches: [{ path: "notes.txt", term: "vessel", line: 1, column: 1, text: "vessel" }],
    skipped: [],
  });
});

test("[boundary-3] does not filter longer words merely containing a generic word", () => {
  const terms = ["administer", "clientele", "examples", "testing", "webbing", "hardcore", "demolition", "mainland"];
  assert.deepEqual(scan(terms, [{ path: "notes.txt", text: terms.join("\n") }]).matches,
    terms.map((term, index) => ({ path: "notes.txt", term, line: index + 1, column: 1, text: term })));
});

test("[boundary-3] generic words may be components of an eligible multiword term", () => {
  assert.deepEqual(scan(["core", "web", "core-web-client"], [{
    path: "notes.txt", text: "CORE/WEB/CLIENT\ncoreWebClient",
  }]).matches, [
    { path: "notes.txt", term: "core-web-client", line: 1, column: 1, text: "CORE/WEB/CLIENT" },
    { path: "notes.txt", term: "core-web-client", line: 2, column: 1, text: "coreWebClient" },
  ]);
});

// Extends "counts letters and digits rather than separators at the four-character cutoff".
test("[boundary-3] includes exactly four alphanumerics even when only one is a letter", () => {
  assert.deepEqual(scan(["q-1-2", "q-1-2-3", "q123", "12q3", "q1"], [{
    path: "notes.txt", text: "q/1/2\nq/1/2/3\nQ123\n12Q3\nq1",
  }]).matches, [
    { path: "notes.txt", term: "q-1-2-3", line: 2, column: 1, text: "q/1/2/3" },
    { path: "notes.txt", term: "q123", line: 3, column: 1, text: "Q123" },
    { path: "notes.txt", term: "12q3", line: 4, column: 1, text: "12Q3" },
  ]);
});

// Extends "requires a letter and counts Unicode letters with digits toward the cutoff".
test("[boundary-3] counts uncased letters and non-ASCII decimal digits", () => {
  assert.deepEqual(scan(["東京湾", "東京湾岸", "港１２", "港１２３", "١٢٣٤٥", "１２-３４５"], [{
    path: "notes.txt", text: "東京湾\n東京湾岸\n港１２\n港１２３\n١٢٣٤٥\n１２/３４５",
  }]).matches, [
    { path: "notes.txt", term: "東京湾岸", line: 2, column: 1, text: "東京湾岸" },
    { path: "notes.txt", term: "港１２３", line: 4, column: 1, text: "港１２３" },
  ]);
});

// Extends "requires a letter and counts Unicode letters with digits toward the cutoff":
// UTF-16 width must not inflate the number of letters in a term.
test("[boundary-3] counts supplementary-plane letters as letters rather than code units", () => {
  const short = "𐐨𐐩𐐪";
  const eligible = "𐐨𐐩𐐪𐐫";
  assert.deepEqual(scan([short, eligible], [{ path: "notes.txt", text: `${short}\n${eligible}` }]), {
    matches: [{ path: "notes.txt", term: eligible, line: 2, column: 1, text: eligible }],
    skipped: [],
  });
});

// Extends "counts letters and digits rather than separators at the four-character cutoff".
test("[boundary-3] punctuation and emoji cannot pad a short term past the cutoff", () => {
  assert.deepEqual(scan(["", "💡💡💡💡", "_---_", "a💡b💡c", "💡ab💡", "---123---"], [{
    path: "a💡b💡c/💡ab💡/---123---.txt",
    text: "💡💡💡💡\n_---_\na💡b💡c\n💡ab💡\n---123---",
  }]), { matches: [], skipped: [] });
});

test("[happy-1] scanning no files returns no matches or skipped paths", () => {
  assert.deepEqual(scan(["orion", "silver-moon"], []), { matches: [], skipped: [] });
});

test("[boundary-3] no eligible terms yields no matches even with many word boundaries", () => {
  assert.deepEqual(scan([], [
    { path: "orion/OrionAPI.txt", text: "Orion\nORION_API\n😀 orion" },
    { path: "other.txt", text: "" },
  ]), { matches: [], skipped: [] });
});
