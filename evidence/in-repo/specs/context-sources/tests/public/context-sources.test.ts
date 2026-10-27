import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONTEXT_DOCUMENTS_MAX,
  CONTEXT_DOCUMENT_BYTES_MAX,
  CONTEXT_DOCUMENT_CHARS,
  CONTEXT_SOURCES,
  CONTEXT_TOTAL_CHARS,
  NO_CONTEXT,
  contextDocuments,
  contextDrift,
  contextKeywords,
  jiraContextFields,
  keptDocuments,
  renderSourceContext,
  type GithubContext,
  type JiraContext,
} from "../src/sources.js";

/**
 * The rules that pick, cut, render and compare the context a bounty takes
 * from its Jira issue and its repository. Every scenario of the spec is
 * keyed by its kind and position among the scenarios of that kind.
 */

const PAY_42: JiraContext = {
  key: "PAY-42",
  issueType: "Story",
  status: "In Progress",
  statusCategory: "indeterminate",
  priority: "High",
  labels: ["billing"],
  components: ["api"],
  fixVersions: [],
  parentKey: "PAY-1",
  dueDate: null,
  storyPoints: 5,
  originalEstimateSeconds: 28800,
  remainingEstimateSeconds: null,
  votes: 0,
  watchers: 3,
  subtaskCount: 2,
  links: [{ type: "Blocks", direction: "outward", key: "PAY-50", done: false }],
  updated: "2026-10-01T10:00:00.000+0000",
};

const PAY_42_FIELDS =
  '{"issueType":"Story","status":"In Progress","statusCategory":"indeterminate","priority":"High","labels":["billing"],"components":["api"],"parentKey":"PAY-1","storyPoints":5,"originalEstimateSeconds":28800,"votes":0,"watchers":3,"subtaskCount":2,"links":[{"type":"Blocks","direction":"outward","key":"PAY-50","done":false}]}';

/** A JiraContext carrying nothing beyond its key. */
function emptyJira(key: string): JiraContext {
  return {
    key,
    issueType: null,
    status: null,
    statusCategory: null,
    priority: null,
    labels: [],
    components: [],
    fixVersions: [],
    parentKey: null,
    dueDate: null,
    storyPoints: null,
    originalEstimateSeconds: null,
    remainingEstimateSeconds: null,
    votes: null,
    watchers: null,
    subtaskCount: 0,
    links: [],
    updated: "2026-10-01T10:00:00.000+0000",
  };
}

const SHA = "0123456789abcdef0123456789abcdef01234567";
const REPO_HEADER = `Repository documents from acme/pay at main (${SHA}):`;

const ACME_PAY: GithubContext = {
  fullName: "acme/pay",
  branch: "main",
  commitSha: SHA,
  documents: [
    { path: "README.md", bytes: 20, text: "# Pay\nCharges cards.\n", truncated: false },
    { path: "docs/setup.md", bytes: 30000, text: "Run make up.", truncated: true },
  ],
  omitted: 2,
};

const RANKING_FILES: readonly { path: string; size: number }[] = [
  { path: "src/index.ts", size: 900 },
  { path: "packages/api/README.md", size: 1500 },
  { path: "docs/billing/invoices.md", size: 3000 },
  { path: "docs/setup.md", size: 2000 },
  { path: "CONTRIBUTING.md", size: 1200 },
  { path: "CHANGELOG.md", size: 50000 },
  { path: "node_modules/x/README.md", size: 100 },
  { path: "docs/empty.md", size: 0 },
  { path: "docs/huge.md", size: 200000 },
  { path: "README.md", size: 4000 },
];

/** "docs/a01.md" to "docs/a<count>.md", each of size 100. */
function numberedDocs(count: number): { path: string; size: number }[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `docs/a${String(index + 1).padStart(2, "0")}.md`,
    size: 100,
  }));
}

/** One document per length, its text that many "a" characters. */
function docsOfLengths(lengths: readonly number[]) {
  return lengths.map((length, index) => ({
    path: `docs/d${index}.md`,
    bytes: length,
    text: "a".repeat(length),
  }));
}

// Constants

test("[happy-1] the sources and caps have their declared values", () => {
  assert.deepEqual([...CONTEXT_SOURCES], ["jira", "github"]);
  assert.equal(CONTEXT_DOCUMENTS_MAX, 12);
  assert.equal(CONTEXT_DOCUMENT_BYTES_MAX, 131072);
  assert.equal(CONTEXT_DOCUMENT_CHARS, 12000);
  assert.equal(CONTEXT_TOTAL_CHARS, 48000);
});

test("[happy-1] the byte cap is exactly 128 KiB", () => {
  assert.equal(CONTEXT_DOCUMENT_BYTES_MAX, 128 * 1024);
});

test("[happy-2] NO_CONTEXT names no version of either source and is frozen", () => {
  assert.deepEqual({ ...NO_CONTEXT }, { jira: null, github: null });
  assert.equal(Object.isFrozen(NO_CONTEXT), true);
});

test("[happy-2] NO_CONTEXT refuses a write and keeps its nulls", () => {
  assert.throws(() => {
    (NO_CONTEXT as { jira: number | null }).jira = 1;
  }, TypeError);
  assert.equal(NO_CONTEXT.jira, null);
  assert.equal(NO_CONTEXT.github, null);
});

// contextKeywords

test("[happy-3] titles become keywords", () => {
  const cases: [string, string[]][] = [
    ["Fix login redirect for SSO users", ["login", "redirect", "sso", "users"]],
    ["Add dark-mode toggle to settings_page", ["dark", "mode", "toggle", "settings", "page"]],
    ["Überprüfung der Zahlungen", ["überprüfung", "der", "zahlungen"]],
    ["Billing/Invoices: export.CSV", ["billing", "invoices", "export", "csv"]],
  ];
  for (const [title, keywords] of cases) {
    assert.deepEqual(contextKeywords(title), keywords, title);
  }
});

test("[happy-3] keywords are not capped and words mixing letters and digits are kept", () => {
  const words = Array.from({ length: 40 }, (_, index) => `word${index}x`);
  assert.deepEqual(contextKeywords(words.join(" ")), words);
  assert.deepEqual(contextKeywords("OAuth2 v10 123abc"), ["oauth2", "v10", "123abc"]);
});

test("[boundary-1] short words, numbers, stopwords and repeats are dropped", () => {
  const cases: [string, string[]][] = [
    ["Upgrade to v2 of API 2024", ["upgrade", "api"]],
    ["Cache cache CACHE", ["cache"]],
    ["ab abc", ["abc"]],
    ["the and with from", []],
    ["", []],
    ["   --- !!! ...", []],
  ];
  for (const [title, keywords] of cases) {
    assert.deepEqual(contextKeywords(title), keywords, JSON.stringify(title));
  }
});

test("[boundary-1] every listed stopword is dropped, whatever its case", () => {
  const stopwords =
    "the and for with from into onto when then than that this these those not are was were been being can could should would will must has have had does did but its our your their they them there here what which who why how all any some via per out off over under about after before also only just more most less new add adds added fix fixes fixed use uses make makes allow allows support supports update updates change changes remove removes improve issue bug feature able need needs get set";
  assert.deepEqual(contextKeywords(stopwords), []);
  assert.deepEqual(contextKeywords(stopwords.toUpperCase()), []);
});

// contextDocuments: what counts

test("[happy-4] which files count as documents", () => {
  const cases: [string, string[]][] = [
    ["README.md", ["README.md"]],
    ["readme", ["readme"]],
    ["Readme.rst", ["Readme.rst"]],
    ["README.txt", ["README.txt"]],
    ["packages/web/README.md", ["packages/web/README.md"]],
    ["GUIDE.md", ["GUIDE.md"]],
    ["docs/intro.mdx", ["docs/intro.mdx"]],
    ["documentation/api/auth.rst", ["documentation/api/auth.rst"]],
    ["website/guides/start.adoc", ["website/guides/start.adoc"]],
    ["DOCS/Setup.MD", ["DOCS/Setup.MD"]],
    ["./docs/setup.md", ["docs/setup.md"]],
  ];
  for (const [path, paths] of cases) {
    assert.deepEqual(contextDocuments([{ path, size: 100 }]), { paths, omitted: 0 }, path);
  }
});

test("[happy-4] every document extension and docs directory counts, a README at any depth", () => {
  const counted = [
    "a/b/c/d/README.markdown",
    "pkg/readme.asciidoc",
    "doc/x.markdown",
    "guide/x.md",
    "Wiki/Page.asciidoc",
    "notes.rst",
  ];
  for (const path of counted) {
    assert.deepEqual(contextDocuments([{ path, size: 100 }]), { paths: [path], omitted: 0 }, path);
  }
});

test("[unhappy-1] code, other text and excluded files are not documents", () => {
  const paths = [
    "src/index.ts",
    "docs/conf.py",
    "docs/diagram.png",
    "notes.txt",
    "requirements.txt",
    "notes/plan.md",
    "CHANGELOG.md",
    "LICENSE.md",
    "docs/CODE_OF_CONDUCT.md",
    ".github/CONTRIBUTING.md",
    "docs/.vitepress/theme.md",
    "node_modules/lib/README.md",
    "vendor/docs/guide.md",
    "test/README.md",
    "README.md.bak",
  ];
  for (const path of paths) {
    assert.deepEqual(contextDocuments([{ path, size: 100 }]), { paths: [], omitted: 0 }, path);
  }
});

test("[unhappy-1] excluded bases, skipped directories and non-README txt never count, even under docs", () => {
  const paths = [
    "docs/history.md",
    "docs/Licence.rst",
    "AUTHORS.md",
    "contributors.md",
    "NOTICE.md",
    "copying.md",
    "changes.md",
    "Dist/README.md",
    "THIRD_PARTY/docs/a.md",
    "build/docs/a.md",
    "docs/notes.txt",
    "packages/web/readme.ja.md",
    "",
    "./",
  ];
  for (const path of paths) {
    assert.deepEqual(contextDocuments([{ path, size: 100 }]), { paths: [], omitted: 0 }, path);
  }
});

// contextDocuments: sizes and caps

test("[boundary-2] the size limit", () => {
  const cases: [number, string[], number][] = [
    [1, ["docs/guide.md"], 0],
    [131072, ["docs/guide.md"], 0],
    [131073, [], 1],
    [0, [], 0],
    [-1, [], 0],
    [Number.NaN, [], 0],
    [Number.POSITIVE_INFINITY, [], 0],
  ];
  for (const [size, paths, omitted] of cases) {
    assert.deepEqual(
      contextDocuments([{ path: "docs/guide.md", size }]),
      { paths, omitted },
      String(size),
    );
  }
});

test("[boundary-2] an oversized file that is not a document is not counted", () => {
  assert.deepEqual(contextDocuments([{ path: "src/big.ts", size: 131073 }]), {
    paths: [],
    omitted: 0,
  });
  assert.deepEqual(contextDocuments([{ path: "docs/guide.md", size: Number.NEGATIVE_INFINITY }]), {
    paths: [],
    omitted: 0,
  });
});

test("[boundary-3] documents past the count cap are counted, not returned", () => {
  const files = numberedDocs(14).reverse();
  assert.deepEqual(contextDocuments(files), {
    paths: numberedDocs(12).map((file) => file.path),
    omitted: 2,
  });
});

test("[boundary-3] oversized documents and those past the cap add up in omitted", () => {
  const files = [...numberedDocs(13), { path: "docs/zz.md", size: 131073 }];
  const result = contextDocuments(files);
  assert.equal(result.paths.length, 12);
  assert.equal(result.omitted, 2);
});

test("[boundary-4] exactly CONTEXT_DOCUMENTS_MAX documents are all returned", () => {
  const result = contextDocuments(numberedDocs(12));
  assert.equal(result.paths.length, 12);
  assert.equal(result.omitted, 0);
});

test("[boundary-4] the ignored and the non-documents do not take a place under the cap", () => {
  const files = [
    ...numberedDocs(12),
    { path: "docs/zero.md", size: 0 },
    { path: "src/index.ts", size: 100 },
  ];
  assert.deepEqual(contextDocuments(files), {
    paths: numberedDocs(12).map((file) => file.path),
    omitted: 0,
  });
});

test("[boundary-5] a path listed twice is one document", () => {
  assert.deepEqual(
    contextDocuments([
      { path: "docs/a.md", size: 100 },
      { path: "./docs/a.md", size: 200000 },
    ]),
    { paths: ["docs/a.md"], omitted: 0 },
  );
});

test("[boundary-5] the first entry of a duplicated path wins", () => {
  assert.deepEqual(
    contextDocuments([
      { path: "./docs/a.md", size: 200000 },
      { path: "docs/a.md", size: 100 },
    ]),
    { paths: [], omitted: 1 },
  );
});

test("[unhappy-2] a listing with no documents returns nothing", () => {
  assert.deepEqual(contextDocuments([]), { paths: [], omitted: 0 });
});

test("[unhappy-2] keywords do not make a listing without documents return anything", () => {
  assert.deepEqual(
    contextDocuments(
      [
        { path: "src/index.ts", size: 100 },
        { path: "docs/conf.py", size: 100 },
      ],
      ["index", "conf"],
    ),
    { paths: [], omitted: 0 },
  );
});

// contextDocuments: ranking

test("[happy-5] without keywords the root README leads, then shallower paths", () => {
  const expected = {
    paths: [
      "README.md",
      "CONTRIBUTING.md",
      "docs/setup.md",
      "docs/billing/invoices.md",
      "packages/api/README.md",
    ],
    omitted: 1,
  };
  assert.deepEqual(contextDocuments(RANKING_FILES, []), expected);
});

test("[happy-5] keywords default to none", () => {
  assert.deepEqual(contextDocuments(RANKING_FILES), contextDocuments(RANKING_FILES, []));
});

test("[happy-5] paths at one depth follow code-point order, not locale order", () => {
  assert.deepEqual(
    contextDocuments([
      { path: "docs/b.md", size: 100 },
      { path: "docs/a.md", size: 100 },
      { path: "docs/B.md", size: 100 },
    ]).paths,
    ["docs/B.md", "docs/a.md", "docs/b.md"],
  );
});

test("[happy-6] paths matching more keywords come right after the root README", () => {
  const cases: [string[], string[]][] = [
    [
      ["billing", "invoices"],
      ["README.md", "docs/billing/invoices.md", "CONTRIBUTING.md", "docs/setup.md", "packages/api/README.md"],
    ],
    [
      ["api"],
      ["README.md", "packages/api/README.md", "CONTRIBUTING.md", "docs/setup.md", "docs/billing/invoices.md"],
    ],
    [
      ["setup", "billing"],
      ["README.md", "docs/setup.md", "docs/billing/invoices.md", "CONTRIBUTING.md", "packages/api/README.md"],
    ],
    [
      ["  Billing ", "BILLING", "", " "],
      ["README.md", "docs/billing/invoices.md", "CONTRIBUTING.md", "docs/setup.md", "packages/api/README.md"],
    ],
    [
      ["readme"],
      ["README.md", "packages/api/README.md", "CONTRIBUTING.md", "docs/setup.md", "docs/billing/invoices.md"],
    ],
  ];
  for (const [keywords, paths] of cases) {
    assert.deepEqual(contextDocuments(RANKING_FILES, keywords).paths, paths, JSON.stringify(keywords));
  }
});

test("[happy-6] a keyword repeated in the list counts once against a deeper match", () => {
  // invoices.md matches "billing" and "docs", setup.md "setup" and "docs":
  // were the repeats counted, invoices.md would lead; tied, depth decides.
  assert.deepEqual(
    contextDocuments(RANKING_FILES, ["billing", "billing", "BILLING", "setup", "docs"]).paths,
    ["README.md", "docs/setup.md", "docs/billing/invoices.md", "CONTRIBUTING.md", "packages/api/README.md"],
  );
});

test("[boundary-6] a keyword match does not move a document ahead of the root README", () => {
  const { paths } = contextDocuments(RANKING_FILES, ["invoices", "billing", "docs"]);
  assert.equal(paths[0], "README.md");
  assert.equal(paths[1], "docs/billing/invoices.md");
});

test("[boundary-6] only a README at the root leads, not one deeper", () => {
  const { paths } = contextDocuments(
    [
      { path: "packages/api/README.md", size: 100 },
      { path: "GUIDE.md", size: 100 },
    ],
    [],
  );
  assert.deepEqual(paths, ["GUIDE.md", "packages/api/README.md"]);
});

test("[boundary-7] ranking does not depend on the order of the listing", () => {
  assert.deepEqual(
    contextDocuments([...RANKING_FILES].reverse(), ["api"]),
    contextDocuments(RANKING_FILES, ["api"]),
  );
});

test("[boundary-7] the listing and keywords are not changed, and results are new arrays", () => {
  const files = RANKING_FILES.map((file) => ({ ...file }));
  const keywords = ["  Billing ", "api"];
  const first = contextDocuments(files, keywords);
  first.paths.push("extra");
  assert.deepEqual(files, RANKING_FILES);
  assert.deepEqual(keywords, ["  Billing ", "api"]);
  assert.deepEqual(contextDocuments(files, keywords).paths, first.paths.slice(0, -1));
});

// keptDocuments

test("[happy-7] a short document is kept as it is", () => {
  assert.deepEqual(keptDocuments([{ path: "README.md", bytes: 10, text: "Hello\r\n" }]), {
    documents: [{ path: "README.md", bytes: 10, text: "Hello\r\n", truncated: false }],
    omitted: 0,
  });
});

test("[happy-7] uncut text keeps its whitespace, and path and bytes pass through", () => {
  const input = [
    { path: "Docs/Odd Name.md", bytes: 999999, text: "  lead\n\n\ttab  \r\n\n" },
    { path: "b.md", bytes: 0, text: "x" },
  ];
  const copy = input.map((document) => ({ ...document }));
  assert.deepEqual(keptDocuments(input), {
    documents: [
      { path: "Docs/Odd Name.md", bytes: 999999, text: "  lead\n\n\ttab  \r\n\n", truncated: false },
      { path: "b.md", bytes: 0, text: "x", truncated: false },
    ],
    omitted: 0,
  });
  assert.deepEqual(input, copy);
});

test("[boundary-8] the per-document cap", () => {
  const cases: [number, number, boolean][] = [
    [1, 1, false],
    [12000, 12000, false],
    [12001, 12000, true],
    [50000, 12000, true],
  ];
  for (const [length, kept, truncated] of cases) {
    const result = keptDocuments(docsOfLengths([length]));
    assert.equal(result.documents.length, 1, String(length));
    assert.equal(result.documents[0]!.text.length, kept, String(length));
    assert.equal(result.documents[0]!.truncated, truncated, String(length));
    assert.equal(result.omitted, 0, String(length));
  }
});

test("[boundary-8] a cut keeps the start of the text", () => {
  const text = "b".repeat(12000) + "TAIL";
  const [document] = keptDocuments([{ path: "a.md", bytes: 1, text }]).documents;
  assert.equal(document!.text, "b".repeat(12000));
  assert.equal(document!.truncated, true);
});

test("[boundary-9] the total cap cuts the document that reaches it and omits the rest", () => {
  const cases: [number[], number[], boolean[], number][] = [
    [[12000, 12000, 12000, 12000, 10], [12000, 12000, 12000, 12000], [false, false, false, false], 1],
    [[12000, 12000, 12000, 11000, 5000], [12000, 12000, 12000, 11000, 1000], [false, false, false, false, true], 0],
    [[20000, 20000, 20000, 20000], [12000, 12000, 12000, 12000], [true, true, true, true], 0],
    [[30000, 30000, 30000, 30000, 30000], [12000, 12000, 12000, 12000], [true, true, true, true], 1],
  ];
  for (const [lengths, kept, truncated, omitted] of cases) {
    const result = keptDocuments(docsOfLengths(lengths));
    const label = JSON.stringify(lengths);
    assert.deepEqual(result.documents.map((document) => document.text.length), kept, label);
    assert.deepEqual(result.documents.map((document) => document.truncated), truncated, label);
    assert.equal(result.omitted, omitted, label);
  }
});

test("[boundary-9] documents keep their input order, not re-ranked by size or path", () => {
  const input = [
    { path: "z.md", bytes: 1, text: "zz" },
    { path: "README.md", bytes: 1, text: "r" },
    { path: "a.md", bytes: 1, text: "aaa" },
  ];
  assert.deepEqual(
    keptDocuments(input).documents.map((document) => document.path),
    ["z.md", "README.md", "a.md"],
  );
});

test("[boundary-10] a cut never ends halfway through a surrogate pair", () => {
  const text = "x".repeat(11999) + "😀" + "tail";
  const result = keptDocuments([{ path: "a.md", bytes: 1, text }]);
  assert.equal(result.documents[0]!.text, "x".repeat(11999));
  assert.equal(result.documents[0]!.truncated, true);
});

test("[boundary-10] a whole surrogate pair inside the cap is kept", () => {
  const text = "x".repeat(11998) + "😀" + "tail";
  const result = keptDocuments([{ path: "a.md", bytes: 1, text }]);
  assert.equal(result.documents[0]!.text, "x".repeat(11998) + "😀");
  assert.equal(result.documents[0]!.truncated, true);
});

test("[boundary-11] a cut that would leave only half a character omits the document", () => {
  const input = [
    ...docsOfLengths([12000, 12000, 12000, 11999]),
    { path: "docs/last.md", bytes: 1, text: "😀abc" },
  ];
  const result = keptDocuments(input);
  assert.equal(result.documents.length, 4);
  assert.equal(result.omitted, 1);
});

test("[boundary-11] once the room is used up, later documents are omitted", () => {
  const input = [
    ...docsOfLengths([12000, 12000, 12000, 11999]),
    { path: "docs/half.md", bytes: 1, text: "😀abc" },
    { path: "docs/one.md", bytes: 1, text: "b" },
    { path: "docs/more.md", bytes: 1, text: "more" },
  ];
  const result = keptDocuments(input);
  // The room is 1 when "😀abc" is met: its cut leaves nothing, so it is
  // omitted and the room stays 1; "b" fits it exactly; "more" meets 0.
  assert.deepEqual(
    result.documents.map((document) => document.path),
    ["docs/d0.md", "docs/d1.md", "docs/d2.md", "docs/d3.md", "docs/one.md"],
  );
  assert.equal(result.documents[4]!.truncated, false);
  assert.equal(result.omitted, 2);
});

test("[boundary-12] more than CONTEXT_DOCUMENTS_MAX documents", () => {
  const input = Array.from({ length: 13 }, (_, index) => ({
    path: `docs/${index + 1}.md`,
    bytes: 5,
    text: `doc ${index + 1}`,
  }));
  const result = keptDocuments(input);
  assert.deepEqual(
    result.documents.map((document) => document.text),
    Array.from({ length: 12 }, (_, index) => `doc ${index + 1}`),
  );
  assert.equal(result.omitted, 1);
});

test("[boundary-12] exactly CONTEXT_DOCUMENTS_MAX documents are all kept", () => {
  const input = Array.from({ length: 12 }, (_, index) => ({
    path: `docs/${index + 1}.md`,
    bytes: 5,
    text: `doc ${index + 1}`,
  }));
  const result = keptDocuments(input);
  assert.equal(result.documents.length, 12);
  assert.equal(result.omitted, 0);
});

test("[unhappy-3] blank documents are dropped without being counted", () => {
  assert.deepEqual(
    keptDocuments([
      { path: "a.md", bytes: 3, text: "  \n" },
      { path: "b.md", bytes: 0, text: "" },
      { path: "README.md", bytes: 5, text: "Hello" },
    ]),
    {
      documents: [{ path: "README.md", bytes: 5, text: "Hello", truncated: false }],
      omitted: 0,
    },
  );
});

test("[unhappy-3] blank documents neither take a place under the count cap nor count past it", () => {
  const docs = Array.from({ length: 12 }, (_, index) => ({
    path: `docs/${index + 1}.md`,
    bytes: 5,
    text: `doc ${index + 1}`,
  }));
  const blank = { path: "blank.md", bytes: 2, text: " \t\r\n" };
  const result = keptDocuments([blank, ...docs.slice(0, 6), blank, ...docs.slice(6), blank]);
  assert.equal(result.documents.length, 12);
  assert.equal(result.omitted, 0);
});

test("[unhappy-4] no documents", () => {
  assert.deepEqual(keptDocuments([]), { documents: [], omitted: 0 });
});

test("[unhappy-4] only blank documents keep nothing and omit nothing", () => {
  assert.deepEqual(
    keptDocuments([
      { path: "a.md", bytes: 1, text: "\n" },
      { path: "b.md", bytes: 1, text: "   " },
    ]),
    { documents: [], omitted: 0 },
  );
});

// jiraContextFields

test("[happy-8] a filled-in issue", () => {
  assert.equal(JSON.stringify(jiraContextFields(PAY_42)), PAY_42_FIELDS);
});

test("[happy-8] links are not capped and keep their order", () => {
  const links = Array.from({ length: 30 }, (_, index) => ({
    type: index % 2 === 0 ? "Blocks" : "Relates",
    direction: index % 2 === 0 ? ("outward" as const) : ("inward" as const),
    key: `PAY-${100 + index}`,
    done: index % 3 === 0,
  }));
  const fields = jiraContextFields({ ...emptyJira("OPS-9"), links });
  assert.deepEqual(fields, { subtaskCount: 0, links });
});

test("[boundary-13] an issue with nothing beyond its key still says how many subtasks it has", () => {
  assert.deepEqual(jiraContextFields(emptyJira("OPS-1")), { subtaskCount: 0 });
});

test("[boundary-13] key and updated are never included", () => {
  const fields = jiraContextFields(PAY_42);
  assert.equal(Object.hasOwn(fields, "key"), false);
  assert.equal(Object.hasOwn(fields, "updated"), false);
});

test("[boundary-14] blank strings are left out, zero is kept, a link without a key keeps its null", () => {
  const context: JiraContext = {
    ...emptyJira("OPS-2"),
    priority: "  ",
    status: "",
    storyPoints: 0,
    dueDate: "2026-11-30",
    subtaskCount: 0,
    links: [{ type: "Relates", direction: "inward", key: null, done: true }],
  };
  assert.equal(
    JSON.stringify(jiraContextFields(context)),
    '{"dueDate":"2026-11-30","storyPoints":0,"subtaskCount":0,"links":[{"type":"Relates","direction":"inward","key":null,"done":true}]}',
  );
});

test("[boundary-14] every zero number is kept and strings are kept as given", () => {
  const context: JiraContext = {
    ...emptyJira("OPS-3"),
    issueType: " Bug ",
    storyPoints: 0,
    originalEstimateSeconds: 0,
    remainingEstimateSeconds: 0,
    votes: 0,
    watchers: 0,
    labels: ["b", "a"],
  };
  assert.equal(
    JSON.stringify(jiraContextFields(context)),
    '{"issueType":" Bug ","labels":["b","a"],"storyPoints":0,"originalEstimateSeconds":0,"remainingEstimateSeconds":0,"votes":0,"watchers":0,"subtaskCount":0}',
  );
});

test("[boundary-15] the result does not share arrays with the context", () => {
  const context: JiraContext = { ...PAY_42, labels: ["billing"] };
  const fields = jiraContextFields(context);
  (fields.labels as string[]).push("extra");
  assert.deepEqual(context.labels, ["billing"]);
});

test("[boundary-15] the result does not share links with the context", () => {
  const link = { type: "Blocks", direction: "outward" as const, key: "PAY-50", done: false };
  const context: JiraContext = { ...PAY_42, links: [link] };
  const fields = jiraContextFields(context);
  const links = fields.links as { key: string | null }[];
  links[0]!.key = "CHANGED";
  links.push({ key: "PAY-99" });
  assert.equal(context.links.length, 1);
  assert.deepEqual(context.links[0], {
    type: "Blocks",
    direction: "outward",
    key: "PAY-50",
    done: false,
  });
  assert.equal(JSON.stringify(jiraContextFields(context)), PAY_42_FIELDS);
});

// renderSourceContext

test("[happy-9] both sources", () => {
  assert.equal(
    renderSourceContext({ jira: PAY_42, github: ACME_PAY }),
    [
      "Jira issue PAY-42:",
      PAY_42_FIELDS,
      "",
      REPO_HEADER,
      "",
      "### README.md",
      "# Pay",
      "Charges cards.",
      "",
      "### docs/setup.md",
      "Run make up.",
      "[truncated]",
      "",
      "2 more documents left out.",
    ].join("\n"),
  );
});

test("[happy-9] only the repository renders without a leading blank line, text uncapped", () => {
  const long = "y".repeat(60000);
  const github: GithubContext = {
    ...ACME_PAY,
    documents: [
      { path: "a.md", bytes: 1, text: `  indented\n${long} \n\n`, truncated: false },
      { path: "b.md", bytes: 1, text: "\n\t", truncated: false },
    ],
    omitted: 0,
  };
  assert.equal(
    renderSourceContext({ jira: null, github }),
    [REPO_HEADER, "", "### a.md", `  indented\n${long}`, "", "### b.md"].join("\n"),
  );
});

test("[happy-10] only Jira", () => {
  assert.equal(
    renderSourceContext({ jira: PAY_42, github: null }),
    `Jira issue PAY-42:\n${PAY_42_FIELDS}`,
  );
});

test("[happy-10] a Jira issue with nothing beyond its key renders its subtask count", () => {
  assert.equal(
    renderSourceContext({ jira: emptyJira("OPS-1"), github: null }),
    'Jira issue OPS-1:\n{"subtaskCount":0}',
  );
});

test("[boundary-16] neither source", () => {
  assert.equal(renderSourceContext({ jira: null, github: null }), "");
});

test("[boundary-16] the rendering has no trailing newline", () => {
  for (const context of [
    { jira: PAY_42, github: null },
    { jira: null, github: ACME_PAY },
    { jira: PAY_42, github: ACME_PAY },
  ]) {
    assert.equal(renderSourceContext(context).endsWith("\n"), false);
  }
});

test("[boundary-17] a repository with no documents", () => {
  assert.equal(
    renderSourceContext({ jira: null, github: { ...ACME_PAY, documents: [], omitted: 0 } }),
    `${REPO_HEADER}\n\nNo documents.`,
  );
  assert.equal(
    renderSourceContext({ jira: null, github: { ...ACME_PAY, documents: [], omitted: 1 } }),
    `${REPO_HEADER}\n\nNo documents.\n\n1 more document left out.`,
  );
});

test("[boundary-17] one document left out uses the singular after documents", () => {
  const github: GithubContext = {
    ...ACME_PAY,
    documents: [{ path: "README.md", bytes: 2, text: "Hi", truncated: false }],
    omitted: 1,
  };
  assert.equal(
    renderSourceContext({ jira: PAY_42, github }),
    `Jira issue PAY-42:\n${PAY_42_FIELDS}\n\n${REPO_HEADER}\n\n### README.md\nHi\n\n1 more document left out.`,
  );
});

test("[boundary-18] a truncated document whose text is blank renders only its heading and marker", () => {
  const github: GithubContext = {
    ...ACME_PAY,
    documents: [{ path: "a.md", bytes: 1, text: " \n", truncated: true }],
    omitted: 0,
  };
  assert.equal(
    renderSourceContext({ jira: null, github }),
    `${REPO_HEADER}\n\n### a.md\n[truncated]`,
  );
});

test("[boundary-18] an untruncated blank document renders only its heading", () => {
  const github: GithubContext = {
    ...ACME_PAY,
    documents: [{ path: "a.md", bytes: 0, text: "", truncated: false }],
    omitted: 0,
  };
  assert.equal(renderSourceContext({ jira: null, github }), `${REPO_HEADER}\n\n### a.md`);
});

// contextDrift

test("[happy-11] drift per source", () => {
  const cases: [
    [number | null, number | null, number | null, number | null],
    unknown,
    unknown,
  ][] = [
    [[3, 2, 3, 2], null, null],
    [[4, 2, 3, 2], { uses: 3, current: 4 }, null],
    [[4, 5, null, null], { uses: null, current: 4 }, { uses: null, current: 5 }],
    [[1, 7, 1, 6], null, { uses: 6, current: 7 }],
  ];
  for (const [[cj, cg, uj, ug], jira, github] of cases) {
    const label = JSON.stringify([cj, cg, uj, ug]);
    const drift = contextDrift({ jira: cj, github: cg }, { jira: uj, github: ug });
    assert.deepEqual(drift.jira, jira, label);
    assert.deepEqual(drift.github, github, label);
  }
});

test("[happy-11] a step one version behind drifts, and the arguments are not changed", () => {
  const current = { jira: 1, github: 10 };
  const used = { jira: 0, github: 9 };
  assert.deepEqual(contextDrift(current, used), {
    jira: { uses: 0, current: 1 },
    github: { uses: 9, current: 10 },
  });
  assert.deepEqual(current, { jira: 1, github: 10 });
  assert.deepEqual(used, { jira: 0, github: 9 });
});

test("[boundary-19] nothing is behind a source the overview holds no version of, or a step ahead of it", () => {
  const cases: [number | null, number | null, number | null, number | null][] = [
    [null, null, 2, 1],
    [null, null, null, null],
    [2, 1, 3, 4],
  ];
  for (const [cj, cg, uj, ug] of cases) {
    assert.deepEqual(
      contextDrift({ jira: cj, github: cg }, { jira: uj, github: ug }),
      { jira: null, github: null },
      JSON.stringify([cj, cg, uj, ug]),
    );
  }
});

test("[boundary-19] a step against NO_CONTEXT is never behind", () => {
  assert.deepEqual(contextDrift(NO_CONTEXT, { jira: 0, github: 5 }), {
    jira: null,
    github: null,
  });
});

test("[boundary-20] NO_CONTEXT against itself", () => {
  assert.deepEqual(contextDrift(NO_CONTEXT, NO_CONTEXT), { jira: null, github: null });
});

test("[boundary-20] a step that used no context is behind every source the overview holds", () => {
  assert.deepEqual(contextDrift({ jira: 1, github: null }, NO_CONTEXT), {
    jira: { uses: null, current: 1 },
    github: null,
  });
});
