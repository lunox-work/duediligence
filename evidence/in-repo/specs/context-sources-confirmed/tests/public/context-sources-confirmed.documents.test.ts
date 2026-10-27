import assert from "node:assert/strict";
import { test } from "node:test";

import { CONTEXT_DOCUMENT_BYTES_MAX, contextDocuments } from "../src/sources.js";

/** The listing the ranking scenarios share. */
const LISTING = [
  { path: "src/index.ts", size: 900 },
  { path: "packages/api/README.md", size: 1500 },
  { path: "docs/billing/invoices.md", size: 3000 },
  { path: "docs/setup.md", size: 2000 },
  { path: "CONTRIBUTING.md", size: 1200 },
  { path: "CHANGELOG.md", size: 50000 },
  { path: "node_modules/x/README.md", size: 100 },
  { path: "docs/empty.md", size: 0 },
  { path: "docs/huge.md", size: 300000 },
  { path: "README.md", size: 4000 },
];

const DEFAULT_ORDER = [
  "README.md",
  "CONTRIBUTING.md",
  "docs/setup.md",
  "docs/billing/invoices.md",
  "packages/api/README.md",
];

/** "docs/a01.md" to "docs/aNN.md", each of size 100. */
function numbered(count: number): { path: string; size: number }[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `docs/a${String(index + 1).padStart(2, "0")}.md`,
    size: 100,
  }));
}

test("[happy-4] which files count as documents", () => {
  for (const path of [
    "README.md",
    "readme.markdown",
    "packages/web/README.md",
    "GUIDE.md",
    "docs/intro.mdx",
    "DOCS/Setup.MD",
    "./docs/setup.md",
    "notes/plan.md",
    "test/README.md",
    "docs/.vitepress/theme.md",
    "Vendor/notes.md",
  ]) {
    assert.deepEqual(
      contextDocuments([{ path, size: 100 }]),
      { paths: [path], omitted: 0 },
      path,
    );
  }
});

test("[happy-4] a skipped directory's name as a file name, and a deep path, still count", () => {
  for (const path of [
    "dist.md",
    "node_modules.md",
    "docs/vendor.md",
    "a/b/c/d/e/Deep.MARKDOWN",
  ]) {
    assert.deepEqual(
      contextDocuments([{ path, size: 100 }]),
      { paths: [path], omitted: 0 },
      path,
    );
  }
});

test("[unhappy-1] code, other text and excluded files are not documents", () => {
  for (const path of [
    "readme",
    "Readme.rst",
    "README.txt",
    "src/index.ts",
    "docs/conf.py",
    "docs/diagram.png",
    "notes.txt",
    "documentation/api/auth.rst",
    "website/guides/start.adoc",
    "CHANGELOG.md",
    "LICENSE.md",
    "docs/CODE_OF_CONDUCT.md",
    "SECURITY.md",
    ".github/CONTRIBUTING.md",
    "node_modules/lib/README.md",
    "vendor/docs/guide.md",
    "examples/demo/README.md",
    "fixtures/a.md",
    "README.md.bak",
  ]) {
    assert.deepEqual(
      contextDocuments([{ path, size: 100 }]),
      { paths: [], omitted: 0 },
      path,
    );
  }
});

test("[unhappy-1] exclusions apply at any depth and boilerplate stems ignore case", () => {
  for (const path of [
    "packages/web/dist/guide.md",
    "docs/.github/notes.md",
    "a/b/__fixtures__/README.md",
    "LICENCE.markdown",
    "docs/Contributors.MDX",
    "packages/api/history.md",
  ]) {
    assert.deepEqual(
      contextDocuments([{ path, size: 100 }]),
      { paths: [], omitted: 0 },
      path,
    );
  }
});

test("[boundary-2] the size limit", () => {
  const cases: [number, string[]][] = [
    [1, ["docs/guide.md"]],
    [262144, ["docs/guide.md"]],
    [262145, []],
    [0, []],
    [-1, []],
    [Number.NaN, []],
    [Number.POSITIVE_INFINITY, []],
  ];
  for (const [size, paths] of cases) {
    assert.deepEqual(
      contextDocuments([{ path: "docs/guide.md", size }]),
      { paths, omitted: 0 },
      String(size),
    );
  }
});

test("[boundary-2] a size just above 0 is read, one just above the cap or below zero is not", () => {
  const cases: [number, string[]][] = [
    [0.5, ["docs/guide.md"]],
    [CONTEXT_DOCUMENT_BYTES_MAX + 0.5, []],
    [Number.NEGATIVE_INFINITY, []],
  ];
  for (const [size, paths] of cases) {
    assert.deepEqual(
      contextDocuments([{ path: "docs/guide.md", size }]),
      { paths, omitted: 0 },
      String(size),
    );
  }
});

test("[boundary-3] documents past the count cap are counted, not returned", () => {
  const files = numbered(14).reverse();
  assert.deepEqual(contextDocuments(files), {
    paths: numbered(12).map((file) => file.path),
    omitted: 2,
  });
});

test("[boundary-3] one past the cap is omitted, and ignored files never count as omitted", () => {
  const files = [
    ...numbered(13),
    { path: "src/index.ts", size: 100 },
    { path: "CHANGELOG.md", size: 100 },
    { path: "docs/huge.md", size: 300000 },
    { path: "docs/empty.md", size: 0 },
  ];
  assert.deepEqual(contextDocuments(files), {
    paths: numbered(12).map((file) => file.path),
    omitted: 1,
  });
});

test("[boundary-4] exactly CONTEXT_DOCUMENTS_MAX documents are all returned", () => {
  const result = contextDocuments(numbered(12));
  assert.equal(result.paths.length, 12);
  assert.equal(result.omitted, 0);
});

test("[boundary-4] twelve documents among ignored files omit nothing", () => {
  const files = [
    { path: "docs/huge.md", size: 262145 },
    ...numbered(12),
    { path: "node_modules/x/README.md", size: 100 },
    { path: "LICENSE.md", size: 100 },
  ];
  assert.deepEqual(contextDocuments(files), {
    paths: numbered(12).map((file) => file.path),
    omitted: 0,
  });
});

test("[unhappy-2] a listing with no documents returns nothing", () => {
  assert.deepEqual(contextDocuments([], []), { paths: [], omitted: 0 });
});

test("[unhappy-2] a listing of only code, excluded and unusable files returns nothing", () => {
  const files = [
    { path: "src/index.ts", size: 900 },
    { path: "CHANGELOG.md", size: 50000 },
    { path: "node_modules/x/README.md", size: 100 },
    { path: "docs/empty.md", size: 0 },
    { path: "docs/huge.md", size: 300000 },
  ];
  assert.deepEqual(contextDocuments(files, ["docs"]), {
    paths: [],
    omitted: 0,
  });
});

test("[happy-5] without keywords the root README leads, then root guides, then docs, then other READMEs", () => {
  assert.deepEqual(contextDocuments(LISTING, []), {
    paths: DEFAULT_ORDER,
    omitted: 0,
  });
});

test("[happy-5] keywords default to none, and the listing is left unchanged", () => {
  const before = structuredClone(LISTING);
  const result = contextDocuments(LISTING);
  assert.deepEqual(result, { paths: DEFAULT_ORDER, omitted: 0 });
  assert.deepEqual(LISTING, before);
  result.paths.reverse();
  assert.deepEqual(contextDocuments(LISTING).paths, DEFAULT_ORDER);
});

test("[happy-6] a path matching a keyword moves ahead of the tier above its own", () => {
  const cases: [string[], string[]][] = [
    [
      ["billing", "invoices"],
      [
        "README.md",
        "docs/billing/invoices.md",
        "CONTRIBUTING.md",
        "docs/setup.md",
        "packages/api/README.md",
      ],
    ],
    [
      ["api"],
      [
        "README.md",
        "CONTRIBUTING.md",
        "packages/api/README.md",
        "docs/setup.md",
        "docs/billing/invoices.md",
      ],
    ],
    [
      ["setup", "billing"],
      [
        "README.md",
        "docs/setup.md",
        "docs/billing/invoices.md",
        "CONTRIBUTING.md",
        "packages/api/README.md",
      ],
    ],
    [["BILLING"], DEFAULT_ORDER],
    [
      ["readme"],
      [
        "README.md",
        "CONTRIBUTING.md",
        "packages/api/README.md",
        "docs/setup.md",
        "docs/billing/invoices.md",
      ],
    ],
    [["contributing"], DEFAULT_ORDER],
  ];
  for (const [keywords, paths] of cases) {
    assert.deepEqual(
      contextDocuments(LISTING, keywords).paths,
      paths,
      JSON.stringify(keywords),
    );
  }
});

test("[happy-6] a keyword is not trimmed before it is matched", () => {
  assert.deepEqual(contextDocuments(LISTING, [" billing"]).paths, DEFAULT_ORDER);
  assert.deepEqual(contextDocuments(LISTING, ["billing "]).paths, DEFAULT_ORDER);
});

test("[boundary-5] matching more keywords does not rank a document higher than matching one", () => {
  assert.deepEqual(
    contextDocuments(LISTING, ["invoices", "billing", "docs"]).paths,
    [
      "README.md",
      "docs/setup.md",
      "docs/billing/invoices.md",
      "CONTRIBUTING.md",
      "packages/api/README.md",
    ],
  );
});

test("[boundary-5] one keyword matching both docs ranks them as three keywords do", () => {
  assert.deepEqual(
    contextDocuments(LISTING, ["docs"]),
    contextDocuments(LISTING, ["invoices", "billing", "docs"]),
  );
});

test("[boundary-6] ranking does not depend on the order of the listing", () => {
  assert.deepEqual(
    contextDocuments([...LISTING].reverse(), ["api"]),
    contextDocuments(LISTING, ["api"]),
  );
});

test("[boundary-6] an interleaved listing ranks the same with and without keywords", () => {
  const shuffled = [
    ...LISTING.filter((_, index) => index % 2 === 1),
    ...LISTING.filter((_, index) => index % 2 === 0),
  ];
  assert.deepEqual(contextDocuments(shuffled, []), contextDocuments(LISTING, []));
  assert.deepEqual(
    contextDocuments(shuffled, ["setup"]),
    contextDocuments(LISTING, ["setup"]),
  );
});

test("[boundary-7] every tier, with and without a match", () => {
  const files = [
    "src/notes/billing.md",
    "packages/api/README.md",
    "docs/setup.md",
    "ARCHITECTURE.md",
    "README.md",
    "adr/0001-record.md",
    "GUIDE.md",
  ].map((path) => ({ path, size: 100 }));
  const cases: [string[], string[]][] = [
    [
      [],
      [
        "README.md",
        "ARCHITECTURE.md",
        "adr/0001-record.md",
        "docs/setup.md",
        "packages/api/README.md",
        "GUIDE.md",
        "src/notes/billing.md",
      ],
    ],
    [
      ["billing"],
      [
        "README.md",
        "ARCHITECTURE.md",
        "adr/0001-record.md",
        "docs/setup.md",
        "src/notes/billing.md",
        "packages/api/README.md",
        "GUIDE.md",
      ],
    ],
    [
      ["guide"],
      [
        "README.md",
        "ARCHITECTURE.md",
        "adr/0001-record.md",
        "docs/setup.md",
        "GUIDE.md",
        "packages/api/README.md",
        "src/notes/billing.md",
      ],
    ],
  ];
  for (const [keywords, paths] of cases) {
    assert.deepEqual(
      contextDocuments(files, keywords).paths,
      paths,
      JSON.stringify(keywords),
    );
  }
});

test("[boundary-7] within one tier the shallowest leads, then code-point path order", () => {
  const files = ["a/a.md", "zz.md", "a.md", "Z.md"].map((path) => ({
    path,
    size: 100,
  }));
  assert.deepEqual(contextDocuments(files).paths, [
    "Z.md",
    "a.md",
    "zz.md",
    "a/a.md",
  ]);
});
