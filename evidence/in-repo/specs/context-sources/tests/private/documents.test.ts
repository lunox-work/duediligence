import assert from "node:assert/strict";
import { test } from "node:test";

import { contextDocuments, contextKeywords } from "../../src/sources.js";

/**
 * contextDocuments: which files of a listing are documents, which are read
 * under the size and count caps, and in what order.
 */

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

/** `<prefix>01.md` to `<prefix><count>.md`, each of size 100. */
function numbered(prefix: string, count: number): { path: string; size: number }[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `${prefix}${String(index + 1).padStart(2, "0")}.md`,
    size: 100,
  }));
}

function only(path: string, size = 100) {
  return contextDocuments([{ path, size }]);
}

// What counts

// Extends "[happy-4] which files count as documents": extensions in any case.
test("[happy-4] document and README extensions count in any case, a README at any depth", () => {
  const counted = [
    "docs/Guide.MARKDOWN",
    "README.MDX",
    "a/b/Readme.TXT",
    "ReadMe.Md",
    "wiki/Home.AsciiDoc",
    "Doc/x.ADOC",
    "notes/readme",
    "x/DOCUMENTATION/y/z.rst",
    "Guides/a/b/c.md",
    "deep/er/still/README.rst",
  ];
  for (const path of counted) {
    assert.deepEqual(only(path), { paths: [path], omitted: 0 }, path);
  }
});

// Extends "[happy-4] which files count as documents": "./docs/setup.md".
test("[happy-4] paths are returned normalized, with their case kept", () => {
  const cases: [string, string][] = [
    ["/Docs/Setup.md", "Docs/Setup.md"],
    ["  docs/a.md  ", "docs/a.md"],
    ["./README.md", "README.md"],
    ["docs/a.md/", "docs/a.md"],
    [".//docs/b.md", "docs/b.md"],
  ];
  for (const [path, normalized] of cases) {
    assert.deepEqual(only(path), { paths: [normalized], omitted: 0 }, path);
  }
});

test("[happy-4] names that only resemble excluded, skipped or test ones still count", () => {
  const counted = [
    "Test/README.md",
    "testing/README.md",
    "docs/licenses.md",
    "CHANGELOG-2024.md",
    "docs/build.md",
    "docs/vendor.md",
    "README.zh-CN.md",
    "docs.md",
    "docs/contributing.md",
  ];
  for (const path of counted) {
    assert.deepEqual(only(path), { paths: [path], omitted: 0 }, path);
  }
});

// Extends "[unhappy-1] code, other text and excluded files are not documents".
test("[unhappy-1] a directory must be a docs directory by its whole name", () => {
  const paths = [
    "mydocs/a.md",
    "docs-site/a.md",
    "src/docs.md",
    "documents/a.md",
    "guidebook/a.md",
    "pkg/README.zh-CN.md",
    "a/b/readme.rst.txt",
    "docs/README.pdf",
    "README.html",
    "docs/a.markdown.txt",
    "README.mdown",
  ];
  for (const path of paths) {
    assert.deepEqual(only(path), { paths: [], omitted: 0 }, path);
  }
});

// Extends "[unhappy-1] excluded bases, skipped directories and non-README txt never count, even under docs".
test("[unhappy-1] hidden, skipped and test segments exclude a file at any depth and in any case", () => {
  const paths = [
    "docs/.hidden.md",
    "pkg/.github/README.md",
    ".docs/a.md",
    ".README.md",
    "packages/x/NODE_MODULES/y/README.md",
    "docs/Vendor/a.md",
    "a/Build/README.md",
    "dist/README.md",
    "Third_Party/README.md",
    "docs/setup.test.md",
    "docs/api.spec.md",
    "tests/docs/a.md",
    "__tests__/README.md",
    "docs/test/a.md",
  ];
  for (const path of paths) {
    assert.deepEqual(only(path), { paths: [], omitted: 0 }, path);
  }
});

test("[unhappy-1] excluded bases never count, whatever their extension, case or directory", () => {
  const paths = [
    "Changes.rst",
    "HISTORY.markdown",
    "docs/authors.adoc",
    "COPYING.md",
    "Notice.mdx",
    "wiki/Code_Of_Conduct.md",
    "Licence.asciidoc",
    "doc/CONTRIBUTORS.rst",
    "guide/ChangeLog.md",
  ];
  for (const path of paths) {
    assert.deepEqual(only(path), { paths: [], omitted: 0 }, path);
  }
});

test("[unhappy-1] a listing of only non-documents, some oversized, returns and counts nothing", () => {
  const files = [
    { path: "src/index.ts", size: 100 },
    { path: "docs/conf.py", size: 500000 },
    { path: "CHANGELOG.md", size: 900000 },
    { path: "node_modules/a/README.md", size: 200000 },
    { path: ".github/README.md", size: 100 },
    { path: "notes/plan.md", size: 100 },
    { path: "test/README.md", size: 300000 },
  ];
  assert.deepEqual(contextDocuments(files, ["readme", "docs"]), { paths: [], omitted: 0 });
});

// Sizes and caps

// Extends "[boundary-2] the size limit".
test("[boundary-2] fractional, negative-zero and largest finite sizes", () => {
  const cases: [string, number, string[], number][] = [
    ["docs/guide.md", 0.5, ["docs/guide.md"], 0],
    ["docs/guide.md", Number.MIN_VALUE, ["docs/guide.md"], 0],
    ["docs/guide.md", -0, [], 0],
    ["docs/guide.md", 131072.5, [], 1],
    ["docs/guide.md", Number.MAX_VALUE, [], 1],
    ["README.md", 131073, [], 1],
    ["README.md", 131072, ["README.md"], 0],
  ];
  for (const [path, size, paths, omitted] of cases) {
    assert.deepEqual(only(path, size), { paths, omitted }, `${path} ${size}`);
  }
});

// Extends "[boundary-2] an oversized file that is not a document is not counted".
test("[boundary-2] every oversized document is counted and none takes a place under the cap", () => {
  const files = [
    { path: "README.md", size: 131073 },
    ...numbered("docs/a", 12),
    { path: "docs/big1.md", size: 200000 },
    { path: "guide/big2.md", size: 1e9 },
  ];
  assert.deepEqual(contextDocuments(files), {
    paths: numbered("docs/a", 12).map((file) => file.path),
    omitted: 3,
  });
});

test("[boundary-2] documents with unusable sizes are ignored in any number", () => {
  const files = [
    ...numbered("docs/z", 14).map((file, index) => ({
      path: file.path,
      size: [0, -5, Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY][index % 5]!,
    })),
    { path: "docs/ok1.md", size: 7 },
    { path: "docs/ok2.md", size: 131072 },
  ];
  assert.deepEqual(contextDocuments(files), {
    paths: ["docs/ok1.md", "docs/ok2.md"],
    omitted: 0,
  });
});

// Extends "[boundary-3] documents past the count cap are counted, not returned".
test("[boundary-3] the cap applies after ranking, so a keyword match listed last survives", () => {
  const result = contextDocuments(numbered("docs/a", 14), ["a14"]);
  assert.deepEqual(result, {
    paths: ["docs/a14.md", ...numbered("docs/a", 11).map((file) => file.path)],
    omitted: 2,
  });
});

test("[boundary-3] the root README listed last survives the cap", () => {
  const result = contextDocuments([...numbered("docs/a", 20), { path: "README.md", size: 100 }]);
  assert.deepEqual(result, {
    paths: ["README.md", ...numbered("docs/a", 11).map((file) => file.path)],
    omitted: 9,
  });
});

test("[boundary-3] shallower documents listed last survive the cap over deeper ones", () => {
  const files = [
    ...numbered("docs/deep/d", 12),
    { path: "B.md", size: 100 },
    { path: "A.md", size: 100 },
  ];
  assert.deepEqual(contextDocuments(files), {
    paths: ["A.md", "B.md", ...numbered("docs/deep/d", 10).map((file) => file.path)],
    omitted: 2,
  });
});

// Extends "[boundary-3] oversized documents and those past the cap add up in omitted".
test("[boundary-3] a listing of a hundred documents keeps twelve and counts the rest", () => {
  const files = Array.from({ length: 100 }, (_, index) => ({
    path: `docs/p${String(index).padStart(3, "0")}.md`,
    size: 10,
  }));
  const result = contextDocuments(files);
  assert.deepEqual(
    result.paths,
    files.slice(0, 12).map((file) => file.path),
  );
  assert.equal(result.omitted, 88);
});

// Extends "[boundary-4] exactly CONTEXT_DOCUMENTS_MAX documents are all returned".
test("[boundary-4] twelve documents of every kind are all returned, in rank order", () => {
  const files = [
    "x/docs/g.md",
    "wiki/c.adoc",
    "packages/web/README.md",
    "guides/d.mdx",
    "notes/readme",
    "GUIDE.md",
    "documentation/f.asciidoc",
    "doc/b.rst",
    "a/b/README.txt",
    "guide/e.markdown",
    "docs/a.md",
    "README.md",
  ].map((path) => ({ path, size: 100 }));
  assert.deepEqual(contextDocuments(files), {
    paths: [
      "README.md",
      "GUIDE.md",
      "doc/b.rst",
      "docs/a.md",
      "documentation/f.asciidoc",
      "guide/e.markdown",
      "guides/d.mdx",
      "notes/readme",
      "wiki/c.adoc",
      "a/b/README.txt",
      "packages/web/README.md",
      "x/docs/g.md",
    ],
    omitted: 0,
  });
});

// Extends "[boundary-4] the ignored and the non-documents do not take a place under the cap".
test("[boundary-4] twelve documents with one listed again are all returned, nothing omitted", () => {
  const files = [...numbered("docs/a", 12), { path: "./docs/a05.md", size: 100 }];
  assert.deepEqual(contextDocuments(files), {
    paths: numbered("docs/a", 12).map((file) => file.path),
    omitted: 0,
  });
});

// Extends "[boundary-5] the first entry of a duplicated path wins".
test("[boundary-5] a first entry with an unusable size hides a later valid duplicate", () => {
  assert.deepEqual(
    contextDocuments([
      { path: "docs/a.md", size: 0 },
      { path: "/docs/a.md", size: 100 },
    ]),
    { paths: [], omitted: 0 },
  );
});

test("[boundary-5] paths that differ only in case are two documents", () => {
  assert.deepEqual(
    contextDocuments([
      { path: "docs/a.md", size: 100 },
      { path: "docs/A.md", size: 100 },
    ]),
    { paths: ["docs/A.md", "docs/a.md"], omitted: 0 },
  );
});

// Extends "[boundary-5] a path listed twice is one document".
test("[boundary-5] three spellings of one path are one document", () => {
  assert.deepEqual(
    contextDocuments([
      { path: "/docs/a.md/", size: 100 },
      { path: "docs/a.md", size: 100 },
      { path: " docs/a.md", size: 300000 },
    ]),
    { paths: ["docs/a.md"], omitted: 0 },
  );
});

test("[boundary-5] duplicates of twelve documents are not counted past the cap", () => {
  const files = [
    ...numbered("docs/a", 12),
    ...numbered("./docs/a", 12).map((file) => ({ path: file.path, size: 999999 })),
  ];
  assert.deepEqual(contextDocuments(files), {
    paths: numbered("docs/a", 12).map((file) => file.path),
    omitted: 0,
  });
});

// Extends "[unhappy-2] a listing with no documents returns nothing".
test("[unhappy-2] a listing of code, blank paths and unusable documents returns nothing", () => {
  const files = [
    { path: "src/a.ts", size: 100 },
    { path: "", size: 100 },
    { path: "/", size: 100 },
    { path: "   ", size: 100 },
    { path: "docs/a.md", size: 0 },
    { path: "README.md", size: Number.NaN },
    { path: "lib/big.js", size: 999999 },
  ];
  assert.deepEqual(contextDocuments(files, ["src", "docs"]), { paths: [], omitted: 0 });
});

test("[unhappy-2] each call returns a new paths array", () => {
  const first = contextDocuments([]);
  first.paths.push("extra");
  assert.deepEqual(contextDocuments([]), { paths: [], omitted: 0 });
});

// Ranking

// Extends "[happy-5] without keywords the root README leads, then shallower paths".
test("[happy-5] every root README leads, ordered among themselves by path", () => {
  const files = ["AAA.md", "readme", "docs/a.md", "README.rst", "Readme.md"].map((path) => ({
    path,
    size: 100,
  }));
  assert.deepEqual(contextDocuments(files).paths, [
    "README.rst",
    "Readme.md",
    "readme",
    "AAA.md",
    "docs/a.md",
  ]);
});

// Extends "[happy-5] paths at one depth follow code-point order, not locale order".
test("[happy-5] code-point order places capitals, underscores and accents as < does", () => {
  const files = ["docs/ä.md", "docs/z.md", "docs/_a.md", "docs/B.md", "docs/a.md"].map(
    (path) => ({ path, size: 100 }),
  );
  assert.deepEqual(contextDocuments(files).paths, [
    "docs/B.md",
    "docs/_a.md",
    "docs/a.md",
    "docs/z.md",
    "docs/ä.md",
  ]);
});

test("[happy-5] ties are broken by the normalized path, not the listed one", () => {
  const files = ["./docs/b.md", "docs/a.md", "/docs/c.md"].map((path) => ({ path, size: 100 }));
  assert.deepEqual(contextDocuments(files).paths, ["docs/a.md", "docs/b.md", "docs/c.md"]);
});

test("[happy-5] depth decides before the path", () => {
  const files = ["docs/a/b/c.md", "docs/z.md", "Z.md", "docs/a/b.md"].map((path) => ({
    path,
    size: 100,
  }));
  assert.deepEqual(contextDocuments(files).paths, [
    "Z.md",
    "docs/z.md",
    "docs/a/b.md",
    "docs/a/b/c.md",
  ]);
});

// Extends "[happy-6] paths matching more keywords come right after the root README".
test("[happy-6] more keywords matched beat a shallower path", () => {
  const files = [
    "GUIDE.md",
    "docs/stripe.md",
    "docs/payments/stripe/webhook-retries.md",
    "docs/webhook/stripe.md",
    "README.md",
  ].map((path) => ({ path, size: 100 }));
  assert.deepEqual(contextDocuments(files, ["stripe", "webhook", "retries"]).paths, [
    "README.md",
    "docs/payments/stripe/webhook-retries.md",
    "docs/webhook/stripe.md",
    "docs/stripe.md",
    "GUIDE.md",
  ]);
});

// Extends "[happy-6] a keyword repeated in the list counts once against a deeper match".
test("[happy-6] a keyword found many times in one path counts once", () => {
  const files = ["docs/doc/doc-doc.md", "guide/doc.md", "documentation/a.md"].map((path) => ({
    path,
    size: 100,
  }));
  assert.deepEqual(contextDocuments(files, ["doc", "guide"]).paths, [
    "guide/doc.md",
    "documentation/a.md",
    "docs/doc/doc-doc.md",
  ]);
});

test("[happy-6] keywords match the lower-cased path anywhere, the extension included", () => {
  const files = ["docs/z.md", "docs/intro.mdx", "DOCS/Setup.MD", "docs/setup-guide.mdx"].map(
    (path) => ({ path, size: 100 }),
  );
  assert.deepEqual(contextDocuments(files, ["SETUP", "mdx"]).paths, [
    "docs/setup-guide.mdx",
    "DOCS/Setup.MD",
    "docs/intro.mdx",
    "docs/z.md",
  ]);
});

test("[happy-6] a keyword is trimmed only at its ends", () => {
  assert.deepEqual(contextDocuments(RANKING_FILES, ["billing invoices", "\tsetup\n"]).paths, [
    "README.md",
    "docs/setup.md",
    "CONTRIBUTING.md",
    "docs/billing/invoices.md",
    "packages/api/README.md",
  ]);
});

test("[happy-6] keywords drawn from a title rank the documents they match", () => {
  const keywords = contextKeywords("Fix invoices export for billing API");
  assert.deepEqual(contextDocuments(RANKING_FILES, keywords), {
    paths: [
      "README.md",
      "docs/billing/invoices.md",
      "packages/api/README.md",
      "CONTRIBUTING.md",
      "docs/setup.md",
    ],
    omitted: 1,
  });
});

test("[happy-6] among root READMEs the keywords matched still rank", () => {
  const files = ["README.md", "readme.rst", "GUIDE.md"].map((path) => ({ path, size: 100 }));
  assert.deepEqual(contextDocuments(files, ["rst"]).paths, ["readme.rst", "README.md", "GUIDE.md"]);
});

// Extends "[boundary-6] a keyword match does not move a document ahead of the root README".
test("[boundary-6] a root README listed last and matching nothing leads every match", () => {
  const files = [
    "docs/billing/invoices.md",
    "packages/api/README.md",
    "docs/README.md",
    "readme",
  ].map((path) => ({ path, size: 100 }));
  assert.deepEqual(contextDocuments(files, ["docs", "billing", "invoices", "api"]).paths, [
    "readme",
    "docs/billing/invoices.md",
    "docs/README.md",
    "packages/api/README.md",
  ]);
});

// Extends "[boundary-6] only a README at the root leads, not one deeper".
test("[boundary-6] a root document named like a README variant does not lead", () => {
  const files = ["docs/README.md", "README.zh-CN.md", "AAA.md"].map((path) => ({
    path,
    size: 100,
  }));
  assert.deepEqual(contextDocuments(files).paths, ["AAA.md", "README.zh-CN.md", "docs/README.md"]);
});

// Extends "[boundary-7] ranking does not depend on the order of the listing".
test("[boundary-7] every rotation and the reverse of a listing rank the same", () => {
  const expected = {
    paths: [
      "README.md",
      "docs/setup.md",
      "docs/billing/invoices.md",
      "CONTRIBUTING.md",
      "packages/api/README.md",
    ],
    omitted: 1,
  };
  const keywords = ["billing", "setup"];
  for (let shift = 0; shift < RANKING_FILES.length; shift += 1) {
    const rotated = [...RANKING_FILES.slice(shift), ...RANKING_FILES.slice(0, shift)];
    assert.deepEqual(contextDocuments(rotated, keywords), expected, String(shift));
    assert.deepEqual(contextDocuments([...rotated].reverse(), keywords), expected, `-${shift}`);
  }
});

test("[boundary-7] order independence holds past the count cap", () => {
  const files = [
    ...numbered("docs/a", 8),
    ...numbered("guide/deep/g", 8),
    ...numbered("R", 4),
  ];
  const expected = contextDocuments(files, ["deep"]);
  assert.deepEqual(expected, {
    paths: [
      ...numbered("guide/deep/g", 8).map((file) => file.path),
      ...numbered("R", 4).map((file) => file.path),
    ],
    omitted: 8,
  });
  const shuffled = files.map((_, index) => files[(index * 7) % files.length]!);
  assert.deepEqual(contextDocuments(shuffled, ["deep"]), expected);
});
