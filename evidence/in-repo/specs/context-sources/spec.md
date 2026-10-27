# Source context for bounties: Jira fields and repository documents

A bounty can take context from its two sources: its Jira issue's fields
beyond the text (type, status, priority, labels, components, releases,
story points, estimates, demand and links) and its repository's own
documents (READMEs, guides and docs, never code). The API reads these and
stores each change as the source's next version; sizing, spec drafting and
the starter agent are shown them; each step records the versions it used.
This spec covers only the domain rules that make that work, in a new module
`packages/core/src/sources.ts`: which repository files count as documents
and which are read, how their text is cut to fixed caps, which Jira fields
are shown, how both sources are rendered into prompt text, and when a step
is behind the context the overview holds now. Every export is a pure,
synchronous function or a constant. None of them reads a clock, a network,
a database or a file, and none mutates its arguments.

## Exports

`packages/core/src/sources.ts` exports exactly the following. The
signatures are the ticket's, unchanged. `packages/core/src/index.ts` adds
`export * from "./sources.js";` so that the package root `sandbox-factory`
re-exports them.

```ts
import type { StageDrift } from "./stages.js";

export const CONTEXT_SOURCES = ["jira", "github"] as const;
export type ContextSource = (typeof CONTEXT_SOURCES)[number];

export interface JiraIssueLinkContext {
    readonly type: string;
    readonly direction: "inward" | "outward";
    readonly key: string | null;
    readonly done: boolean;
}

export interface JiraContext {
    readonly key: string;
    readonly issueType: string | null;
    readonly status: string | null;
    readonly statusCategory: string | null;
    readonly priority: string | null;
    readonly labels: readonly string[];
    readonly components: readonly string[];
    readonly fixVersions: readonly string[];
    readonly parentKey: string | null;
    readonly dueDate: string | null;
    readonly storyPoints: number | null;
    readonly originalEstimateSeconds: number | null;
    readonly remainingEstimateSeconds: number | null;
    readonly votes: number | null;
    readonly watchers: number | null;
    readonly subtaskCount: number;
    readonly links: readonly JiraIssueLinkContext[];
    readonly updated: string | null;
}

export interface GithubContextDocument {
    readonly path: string;
    readonly bytes: number;
    readonly text: string;
    readonly truncated: boolean;
}

export interface GithubContext {
    readonly fullName: string;
    readonly branch: string;
    readonly commitSha: string;
    readonly documents: readonly GithubContextDocument[];
    readonly omitted: number;
}

export interface ContextVersions {
    readonly jira: number | null;
    readonly github: number | null;
}

export const NO_CONTEXT: ContextVersions; // Object.freeze({ jira: null, github: null })
export const CONTEXT_DOCUMENTS_MAX = 12;
export const CONTEXT_DOCUMENT_BYTES_MAX = 131_072; // 128 KiB
export const CONTEXT_DOCUMENT_CHARS = 12000;
export const CONTEXT_TOTAL_CHARS = 48000;

export function contextKeywords(title: string): string[];
export function contextDocuments(
    files: readonly { readonly path: string; readonly size: number }[],
    keywords: readonly string[] = [],
): { readonly paths: string[]; readonly omitted: number };
export function keptDocuments(
    documents: readonly { readonly path: string; readonly bytes: number; readonly text: string }[],
): { readonly documents: GithubContextDocument[]; readonly omitted: number };
export function jiraContextFields(context: JiraContext): Record<string, unknown>;
export function renderSourceContext(context: {
    readonly jira: JiraContext | null;
    readonly github: GithubContext | null;
}): string;
export function contextDrift(current: ContextVersions, used: ContextVersions): {
    readonly jira: StageDrift | null;
    readonly github: StageDrift | null;
};
```

`StageDrift` is the existing type from `packages/core/src/stages.ts`.
`sources.ts` reuses `normalizePath`, `extensionOf`, `isTestFile` and
`NO_EXTENSION` from `packages/core/src/repo/tree.ts`. Every existing
export keeps its current behaviour, including `stageDrift`,
`overviewVersionOf`, `overviewApproved`, everything in `repo/tree.ts`,
`bounty.ts`, `handle.ts` and `analysis.ts`, and `CONTEXT_BUILDERS` (the
analysis tools, a different thing from these sources). The one other
change in the package is that `STARTER_TOOL_VERSION` in
`packages/core/src/analysis.ts` becomes `"sandbox_starter@3"`, because the
starter agent is now shown this context. Every list a function returns is
a new array: changing it does not change the arguments or any later
result.

## Definitions used below

- **Code-point order** compares strings with `<` and `>`, as
  `repo/tree.ts` does. It does not use `localeCompare`.
- A path's **segments** are the parts of its `normalizePath` result split
  on `/`. Its **name** is the last segment, and its **directories** are the
  segments before the name. Its **depth** is the number of segments.
- A name's **base** is the name lower-cased, without its final `.` and
  extension when `extensionOf` gives one (`README.md` → `readme`, `README`
  → `readme`, `readme.ja.md` → `readme.ja`).
- **Document extensions** are `md`, `markdown`, `mdx`, `rst`, `adoc` and
  `asciidoc`, compared with the lower-cased `extensionOf` result.
- **Docs directories** are `docs`, `doc`, `documentation`, `guide`,
  `guides` and `wiki`, compared case-insensitively.
- **Skipped directories** are `node_modules`, `vendor`, `third_party`,
  `dist` and `build`, compared case-insensitively.
- **Excluded bases** are `changelog`, `changes`, `history`, `license`,
  `licence`, `copying`, `notice`, `code_of_conduct`, `authors` and
  `contributors`.
- **Stopwords** are the following words, which `contextKeywords` never
  returns: `the and for with from into onto when then than that this these
  those not are was were been being can could should would will must has
  have had does did but its our your their they them there here what which
  who why how all any some via per out off over under about after before
  also only just more most less new add adds added fix fixes fixed use uses
  make makes allow allows support supports update updates change changes
  remove removes improve issue bug feature able need needs get set`.

```gherkin
Feature: Source context for bounties
  The rules in packages/core/src/sources.ts that pick, cut, render and
  compare the context a bounty takes from its Jira issue and its repository.

  Background:
    Given the exports of "packages/core/src/sources.ts"

  Rule: The constants are fixed values

    @happy
    Scenario: The sources and caps have their declared values
      Then CONTEXT_SOURCES deep-equals ["jira", "github"]
      And CONTEXT_DOCUMENTS_MAX is 12
      And CONTEXT_DOCUMENT_BYTES_MAX is 131072
      And CONTEXT_DOCUMENT_CHARS is 12000
      And CONTEXT_TOTAL_CHARS is 48000

    @happy
    Scenario: NO_CONTEXT names no version of either source and cannot be changed
      Then NO_CONTEXT deep-equals { "jira": null, "github": null }
      And Object.isFrozen(NO_CONTEXT) is true

  Rule: contextKeywords lower-cases the title, splits it into words and keeps the meaningful ones in first-seen order without repeats
    A word is a maximal run of Unicode letters or digits (\p{L}\p{N}), so
    spaces, hyphens, underscores, slashes, dots and other punctuation all
    separate words. The title is lower-cased with toLowerCase before it is
    split. A word is kept when it has at least 3 UTF-16 code units, is not
    made only of digits, and is not a stopword. There is no cap on the
    number of words kept.

    @happy
    Scenario Outline: Titles become keywords
      When contextKeywords is called with "<title>"
      Then it returns <keywords>

      Examples:
        | title                                 | keywords                                          |
        | Fix login redirect for SSO users      | ["login", "redirect", "sso", "users"]             |
        | Add dark-mode toggle to settings_page | ["dark", "mode", "toggle", "settings", "page"]    |
        | Überprüfung der Zahlungen             | ["überprüfung", "der", "zahlungen"]               |
        | Billing/Invoices: export.CSV          | ["billing", "invoices", "export", "csv"]          |

    @boundary
    Scenario Outline: Short words, numbers, stopwords and repeats are dropped
      When contextKeywords is called with "<title>"
      Then it returns <keywords>

      Examples:
        | title                     | keywords            |
        | Upgrade to v2 of API 2024 | ["upgrade", "api"]  |
        | Cache cache CACHE         | ["cache"]           |
        | ab abc                    | ["abc"]             |
        | the and with from         | []                  |
        |                           | []                  |
        |    --- !!! ...            | []                  |

  Rule: contextDocuments counts a file as a document only when it is a README anywhere, or a document-extension file at the root or under a docs directory, and it is not excluded
    Each path is first passed through normalizePath, and an empty result is
    ignored. A file is a README when its base is "readme" and its extension
    is NO_EXTENSION, "txt" or a document extension. A README counts at any
    depth. A file that is not a README counts only when its extension is a
    document extension and it is at the root (depth 1) or one of its
    directories is a docs directory. A file never counts when any of its
    segments starts with ".", any of its directories is a skipped
    directory, isTestFile(path) is true, or its base is an excluded base.
    A file that does not count is neither returned nor counted in
    "omitted".

    @happy
    Scenario Outline: Which files count as documents
      Given a file "<path>" of size 100
      When contextDocuments is called with only that file and no keywords
      Then paths is <paths>
      And omitted is 0

      Examples:
        | path                          | paths                          |
        | README.md                     | ["README.md"]                  |
        | readme                        | ["readme"]                     |
        | Readme.rst                    | ["Readme.rst"]                 |
        | README.txt                    | ["README.txt"]                 |
        | packages/web/README.md        | ["packages/web/README.md"]     |
        | GUIDE.md                      | ["GUIDE.md"]                   |
        | docs/intro.mdx                | ["docs/intro.mdx"]             |
        | documentation/api/auth.rst    | ["documentation/api/auth.rst"] |
        | website/guides/start.adoc     | ["website/guides/start.adoc"]  |
        | DOCS/Setup.MD                 | ["DOCS/Setup.MD"]              |
        | ./docs/setup.md               | ["docs/setup.md"]              |

    @unhappy
    Scenario Outline: Code, other text and excluded files are not documents
      Given a file "<path>" of size 100
      When contextDocuments is called with only that file and no keywords
      Then paths is []
      And omitted is 0

      Examples:
        | path                        | why                              |
        | src/index.ts                | code                             |
        | docs/conf.py                | code under a docs directory      |
        | docs/diagram.png            | not a document extension         |
        | notes.txt                   | txt counts only for a README     |
        | requirements.txt            | txt counts only for a README     |
        | notes/plan.md               | not at the root or under docs    |
        | CHANGELOG.md                | excluded base                    |
        | LICENSE.md                  | excluded base                    |
        | docs/CODE_OF_CONDUCT.md     | excluded base                    |
        | .github/CONTRIBUTING.md     | hidden segment                   |
        | docs/.vitepress/theme.md    | hidden segment                   |
        | node_modules/lib/README.md  | skipped directory                |
        | vendor/docs/guide.md        | skipped directory                |
        | test/README.md              | test file                        |
        | README.md.bak               | not a document extension         |

  Rule: contextDocuments reads only documents with a usable size, at most CONTEXT_DOCUMENTS_MAX of them, and counts the rest in omitted
    A document whose size is not finite or is 0 or less is ignored and not
    counted. A document whose size is above CONTEXT_DOCUMENT_BYTES_MAX is
    not returned and is counted in "omitted". After ranking, only the first
    CONTEXT_DOCUMENTS_MAX documents are returned, and each one past that is
    counted in "omitted". When two entries normalize to the same path, only
    the first is considered.

    @boundary
    Scenario Outline: The size limit
      Given a file "docs/guide.md" of size <size>
      When contextDocuments is called with only that file and no keywords
      Then paths is <paths>
      And omitted is <omitted>

      Examples:
        | size     | paths             | omitted |
        | 1        | ["docs/guide.md"] | 0       |
        | 131072   | ["docs/guide.md"] | 0       |
        | 131073   | []                | 1       |
        | 0        | []                | 0       |
        | -1       | []                | 0       |
        | NaN      | []                | 0       |
        | Infinity | []                | 0       |

    @boundary
    Scenario: Documents past the count cap are counted, not returned
      Given the files "docs/a01.md" to "docs/a14.md", each of size 100, listed in reverse order
      When contextDocuments is called with those files and no keywords
      Then paths is "docs/a01.md" to "docs/a12.md" in that order
      And omitted is 2

    @boundary
    Scenario: Exactly CONTEXT_DOCUMENTS_MAX documents are all returned
      Given the files "docs/a01.md" to "docs/a12.md", each of size 100
      When contextDocuments is called with those files and no keywords
      Then paths has 12 entries
      And omitted is 0

    @boundary
    Scenario: A path listed twice is one document
      Given the files:
        | path          | size   |
        | docs/a.md     | 100    |
        | ./docs/a.md   | 200000 |
      When contextDocuments is called with those files and no keywords
      Then paths is ["docs/a.md"]
      And omitted is 0

    @unhappy
    Scenario: A listing with no documents returns nothing
      When contextDocuments is called with [] and no keywords
      Then paths is [] and omitted is 0

  Rule: contextDocuments ranks the root README first, then by keywords matched, then shallowest, then by path
    The sort key, in this order, is: a README at depth 1 before anything
    else; then the number of distinct keywords found in the path, highest
    first; then depth, lowest first; then the normalized path in code-point
    order. Each keyword is trimmed and lower-cased; blank keywords are
    ignored and repeats count once. A keyword matches when it is a
    substring of the lower-cased normalized path. Returned paths are the
    normalized paths with their original case.

    Background:
      Given the files:
        | path                     | size   |
        | src/index.ts             | 900    |
        | packages/api/README.md   | 1500   |
        | docs/billing/invoices.md | 3000   |
        | docs/setup.md            | 2000   |
        | CONTRIBUTING.md          | 1200   |
        | CHANGELOG.md             | 50000  |
        | node_modules/x/README.md | 100    |
        | docs/empty.md            | 0      |
        | docs/huge.md             | 200000 |
        | README.md                | 4000   |

    @happy
    Scenario: Without keywords the root README leads, then shallower paths
      When contextDocuments is called with those files and keywords []
      Then paths is ["README.md", "CONTRIBUTING.md", "docs/setup.md", "docs/billing/invoices.md", "packages/api/README.md"]
      And omitted is 1

    @happy
    Scenario Outline: Paths matching more keywords come right after the root README
      When contextDocuments is called with those files and keywords <keywords>
      Then paths is <paths>

      Examples:
        | keywords                           | paths                                                                                                   |
        | ["billing", "invoices"]            | ["README.md", "docs/billing/invoices.md", "CONTRIBUTING.md", "docs/setup.md", "packages/api/README.md"] |
        | ["api"]                            | ["README.md", "packages/api/README.md", "CONTRIBUTING.md", "docs/setup.md", "docs/billing/invoices.md"] |
        | ["setup", "billing"]               | ["README.md", "docs/setup.md", "docs/billing/invoices.md", "CONTRIBUTING.md", "packages/api/README.md"] |
        | ["  Billing ", "BILLING", "", " "] | ["README.md", "docs/billing/invoices.md", "CONTRIBUTING.md", "docs/setup.md", "packages/api/README.md"] |
        | ["readme"]                         | ["README.md", "packages/api/README.md", "CONTRIBUTING.md", "docs/setup.md", "docs/billing/invoices.md"] |

    @boundary
    Scenario: A keyword match does not move a document ahead of the root README
      When contextDocuments is called with those files and keywords ["invoices", "billing", "docs"]
      Then paths[0] is "README.md"
      And paths[1] is "docs/billing/invoices.md"

    @boundary
    Scenario: Ranking does not depend on the order of the listing
      When contextDocuments is called with those files in reverse order and keywords ["api"]
      Then the result deep-equals the result for the files in their listed order with keywords ["api"]

  Rule: keptDocuments keeps documents in the order given, cuts each to CONTEXT_DOCUMENT_CHARS and all of them together to CONTEXT_TOTAL_CHARS
    Documents are taken in input order with a running room that starts at
    CONTEXT_TOTAL_CHARS. A document whose text is blank (text.trim() is "")
    is dropped and not counted. Once CONTEXT_DOCUMENTS_MAX documents have
    been kept, each later non-blank document is counted in "omitted". A
    non-blank document met when the room is 0 is counted in "omitted".
    Otherwise its text is cut to min(CONTEXT_DOCUMENT_CHARS, room) UTF-16
    code units. When the cut ends in a high surrogate (U+D800 to U+DBFF),
    that code unit is dropped too, so no character is halved. A document
    whose cut leaves an empty text is counted in "omitted". A kept
    document's room is reduced by its kept text's length. Its "truncated"
    flag is true exactly when its text was cut. Its "path" and "bytes" pass
    through unchanged, and an uncut text is kept verbatim, line endings and
    whitespace included.

    @happy
    Scenario: A short document is kept as it is
      When keptDocuments is called with [{ "path": "README.md", "bytes": 10, "text": "Hello\r\n" }]
      Then documents is [{ "path": "README.md", "bytes": 10, "text": "Hello\r\n", "truncated": false }]
      And omitted is 0

    @boundary
    Scenario Outline: The per-document cap
      When keptDocuments is called with one document whose text is <length> "a" characters
      Then that document's text has <kept> characters
      And its truncated is <truncated>
      And omitted is 0

      Examples:
        | length | kept  | truncated |
        | 1      | 1     | false     |
        | 12000  | 12000 | false     |
        | 12001  | 12000 | true      |
        | 50000  | 12000 | true      |

    @boundary
    Scenario Outline: The total cap cuts the document that reaches it and omits the rest
      When keptDocuments is called with documents whose texts have lengths <lengths>
      Then the kept texts have lengths <kept>
      And their truncated flags are <truncated>
      And omitted is <omitted>

      Examples:
        | lengths                             | kept                         | truncated                               | omitted |
        | [12000, 12000, 12000, 12000, 10]    | [12000, 12000, 12000, 12000] | [false, false, false, false]            | 1       |
        | [12000, 12000, 12000, 11000, 5000]  | [12000, 12000, 12000, 11000, 1000] | [false, false, false, false, true] | 0       |
        | [20000, 20000, 20000, 20000]        | [12000, 12000, 12000, 12000] | [true, true, true, true]                | 0       |
        | [30000, 30000, 30000, 30000, 30000] | [12000, 12000, 12000, 12000] | [true, true, true, true]                | 1       |

    @boundary
    Scenario: A cut never ends halfway through a surrogate pair
      When keptDocuments is called with one document whose text is 11999 "x" characters, then "😀", then "tail"
      Then that document's text is 11999 "x" characters
      And its truncated is true

    @boundary
    Scenario: A cut that would leave only half a character omits the document
      When keptDocuments is called with documents whose texts are 12000, 12000, 12000 and 11999 "a" characters, then "😀abc"
      Then four documents are kept
      And omitted is 1

    @boundary
    Scenario: More than CONTEXT_DOCUMENTS_MAX documents
      When keptDocuments is called with 13 documents whose texts are "doc 1" to "doc 13"
      Then documents are "doc 1" to "doc 12" in that order
      And omitted is 1

    @unhappy
    Scenario: Blank documents are dropped without being counted
      When keptDocuments is called with:
        | path      | bytes | text    |
        | a.md      | 3     | "  \n"  |
        | b.md      | 0     | ""      |
        | README.md | 5     | "Hello" |
      Then documents is [{ "path": "README.md", "bytes": 5, "text": "Hello", "truncated": false }]
      And omitted is 0

    @unhappy
    Scenario: No documents
      When keptDocuments is called with []
      Then documents is [] and omitted is 0

  Rule: jiraContextFields gives the issue's fields beyond its key and text in a fixed order, leaving out what carries nothing
    The keys, in this insertion order, are: issueType, status,
    statusCategory, priority, labels, components, fixVersions, parentKey,
    dueDate, storyPoints, originalEstimateSeconds,
    remainingEstimateSeconds, votes, watchers, subtaskCount, links. "key"
    and "updated" are never included. A field is left out when it is null,
    a string that is blank after trim, or an empty array. Strings, numbers
    (0 included) and array items are kept as given, in their given order.
    subtaskCount is always included. Each link is a new object with the
    keys type, direction, key and done, in that order, and keeps a null
    key. Arrays in the result are new arrays.

    @happy
    Scenario: A filled-in issue
      Given the JiraContext "PAY-42":
        """
        { "key": "PAY-42", "issueType": "Story", "status": "In Progress",
          "statusCategory": "indeterminate", "priority": "High",
          "labels": ["billing"], "components": ["api"], "fixVersions": [],
          "parentKey": "PAY-1", "dueDate": null, "storyPoints": 5,
          "originalEstimateSeconds": 28800, "remainingEstimateSeconds": null,
          "votes": 0, "watchers": 3, "subtaskCount": 2,
          "links": [{ "type": "Blocks", "direction": "outward", "key": "PAY-50", "done": false }],
          "updated": "2026-10-01T10:00:00.000+0000" }
        """
      When jiraContextFields is called with it
      Then JSON.stringify of the result is:
        """
        {"issueType":"Story","status":"In Progress","statusCategory":"indeterminate","priority":"High","labels":["billing"],"components":["api"],"parentKey":"PAY-1","storyPoints":5,"originalEstimateSeconds":28800,"votes":0,"watchers":3,"subtaskCount":2,"links":[{"type":"Blocks","direction":"outward","key":"PAY-50","done":false}]}
        """

    @boundary
    Scenario: An issue with nothing beyond its key still says how many subtasks it has
      Given a JiraContext with key "OPS-1", every nullable field null, every array empty, subtaskCount 0 and updated "2026-10-01T10:00:00.000+0000"
      When jiraContextFields is called with it
      Then the result deep-equals { "subtaskCount": 0 }

    @boundary
    Scenario: Blank strings are left out, zero is kept, a link without a key keeps its null
      Given a JiraContext with key "OPS-2", priority "  ", status "", storyPoints 0, dueDate "2026-11-30", subtaskCount 0, links [{ "type": "Relates", "direction": "inward", "key": null, "done": true }] and every other field null or empty
      When jiraContextFields is called with it
      Then JSON.stringify of the result is:
        """
        {"dueDate":"2026-11-30","storyPoints":0,"subtaskCount":0,"links":[{"type":"Relates","direction":"inward","key":null,"done":true}]}
        """

    @boundary
    Scenario: The result does not share arrays with the context
      Given the JiraContext "PAY-42"
      When jiraContextFields is called with it and the returned labels array has "extra" pushed onto it
      Then the context's labels are still ["billing"]

  Rule: renderSourceContext writes the Jira section, then the repository section, separated by one blank line
    The Jira section is the line "Jira issue <key>:" followed by a line
    holding JSON.stringify(jiraContextFields(jira)). The repository section
    starts with the line
    "Repository documents from <fullName> at <branch> (<commitSha>):", with
    the three values verbatim. Each document follows as a block after one
    blank line. A block is the line "### <path>", then the text with
    trailing whitespace removed (no line when that leaves it empty), then
    the line "[truncated]" when the document is truncated. When there are
    no documents, one blank line and the line "No documents." follow the
    header instead. When omitted is above 0, one blank line and the line
    "1 more document left out." or "<n> more documents left out." come
    last. Lines are joined with "\n" and there is no trailing newline. A
    null source contributes nothing, and with both null the result is "".
    No caps are applied here: the text is rendered as given. In the
    tables below, "\n" stands for a newline character.

    Background:
      Given the JiraContext "PAY-42" from the jiraContextFields rule
      And the GithubContext "acme/pay":
        """
        { "fullName": "acme/pay", "branch": "main",
          "commitSha": "0123456789abcdef0123456789abcdef01234567",
          "documents": [
            { "path": "README.md", "bytes": 20, "text": "# Pay\nCharges cards.\n", "truncated": false },
            { "path": "docs/setup.md", "bytes": 30000, "text": "Run make up.", "truncated": true }
          ],
          "omitted": 2 }
        """

    @happy
    Scenario: Both sources
      When renderSourceContext is called with { "jira": "PAY-42", "github": "acme/pay" }
      Then it returns:
        """
        Jira issue PAY-42:
        {"issueType":"Story","status":"In Progress","statusCategory":"indeterminate","priority":"High","labels":["billing"],"components":["api"],"parentKey":"PAY-1","storyPoints":5,"originalEstimateSeconds":28800,"votes":0,"watchers":3,"subtaskCount":2,"links":[{"type":"Blocks","direction":"outward","key":"PAY-50","done":false}]}

        Repository documents from acme/pay at main (0123456789abcdef0123456789abcdef01234567):

        ### README.md
        # Pay
        Charges cards.

        ### docs/setup.md
        Run make up.
        [truncated]

        2 more documents left out.
        """

    @happy
    Scenario: Only Jira
      When renderSourceContext is called with { "jira": "PAY-42", "github": null }
      Then it returns the two Jira lines of the previous scenario and nothing else

    @boundary
    Scenario: Neither source
      When renderSourceContext is called with { "jira": null, "github": null }
      Then it returns ""

    @boundary
    Scenario Outline: A repository with no documents
      Given the GithubContext "acme/pay" with documents [] and omitted <omitted>
      When renderSourceContext is called with { "jira": null, "github": that context }
      Then it returns "<text>"

      Examples:
        | omitted | text                                                                                                                      |
        | 0       | Repository documents from acme/pay at main (0123456789abcdef0123456789abcdef01234567):\n\nNo documents.                     |
        | 1       | Repository documents from acme/pay at main (0123456789abcdef0123456789abcdef01234567):\n\nNo documents.\n\n1 more document left out. |

    @boundary
    Scenario: A truncated document whose text is blank renders only its heading and marker
      Given the GithubContext "acme/pay" with documents [{ "path": "a.md", "bytes": 1, "text": " \n", "truncated": true }] and omitted 0
      When renderSourceContext is called with { "jira": null, "github": that context }
      Then it returns "Repository documents from acme/pay at main (0123456789abcdef0123456789abcdef01234567):\n\n### a.md\n[truncated]"

  Rule: contextDrift says a step is behind a source when the overview holds a newer version of it than the step used
    For each source, when current[source] is null the drift is null.
    Otherwise, when used[source] is null or less than current[source], the
    drift is { uses: used[source], current: current[source] }. Otherwise,
    when the step used the same version or a later one, the drift is null.

    @happy
    Scenario Outline: Drift per source
      When contextDrift is called with current { "jira": <cj>, "github": <cg> } and used { "jira": <uj>, "github": <ug> }
      Then jira is <jira>
      And github is <github>

      Examples:
        | cj   | cg   | uj   | ug   | jira                         | github                       |
        | 3    | 2    | 3    | 2    | null                         | null                         |
        | 4    | 2    | 3    | 2    | { "uses": 3, "current": 4 }  | null                         |
        | 4    | 5    | null | null | { "uses": null, "current": 4 } | { "uses": null, "current": 5 } |
        | 1    | 7    | 1    | 6    | null                         | { "uses": 6, "current": 7 }  |

    @boundary
    Scenario Outline: Nothing is behind a source the overview holds no version of, or a step ahead of it
      When contextDrift is called with current { "jira": <cj>, "github": <cg> } and used { "jira": <uj>, "github": <ug> }
      Then jira is null
      And github is null

      Examples:
        | cj   | cg   | uj   | ug   |
        | null | null | 2    | 1    |
        | null | null | null | null |
        | 2    | 1    | 3    | 4    |

    @boundary
    Scenario: NO_CONTEXT against itself
      When contextDrift is called with NO_CONTEXT and NO_CONTEXT
      Then it returns { "jira": null, "github": null }
```

## Decided:

- `NO_CONTEXT` is `{ jira: null, github: null }`, frozen.
- `CONTEXT_DOCUMENT_BYTES_MAX` is 131072 (128 KiB). A larger document is counted in `omitted` and never read.
- A file with a size that is 0 or less, or not finite, is ignored and not counted in `omitted`.
- What counts as a document: a README (base `readme`, with no extension, `txt` or a document extension) at any depth, or a `md`/`markdown`/`mdx`/`rst`/`adoc`/`asciidoc` file at the root or under a `docs`/`doc`/`documentation`/`guide`/`guides`/`wiki` directory.
- These are never documents: hidden segments, `node_modules`/`vendor`/`third_party`/`dist`/`build`, test files, and changelog/licence-style bases.
- Document ranking: root README first, then distinct keywords matched (substring, case-insensitive), then depth, then code-point path order. The result is the same whatever the input order.
- Paths are normalized with `normalizePath` and keep their case. Duplicate paths count once, and the first entry wins.
- `omitted` from `contextDocuments` counts oversized documents plus those past the 12-document cap.
- Keywords: lower-cased runs of letters and digits, at least 3 code units, not all digits, not stopwords (the exact list is given), no repeats, in first-seen order, with no cap.
- Caller keywords are trimmed and lower-cased; blank keywords are ignored and repeats count once.
- `keptDocuments` keeps the input order and does not re-rank.
- The total cap cuts the document that reaches it. Once the room is 0, later documents are omitted and counted.
- Cuts count UTF-16 code units and never split a surrogate pair. A cut that leaves nothing omits the document.
- Blank texts are dropped without being counted. Uncut text is kept verbatim, with no line-ending normalization.
- `keptDocuments` also enforces the 12-document cap and counts the extra documents in `omitted`.
- No truncation marker goes into stored text. `truncated` carries that, and `renderSourceContext` adds `[truncated]`.
- `jiraContextFields` leaves out `key` and `updated`, plus nulls, blank strings and empty arrays. It keeps `0` and always includes `subtaskCount`. Key order is fixed, and links are not capped.
- `renderSourceContext` format: Jira section first, then the repository section, joined by one blank line.
- `renderSourceContext` details: `### path` headings, `[truncated]` marker lines, `No documents.`, and the "N more document(s) left out." line. There is no trailing newline, and the result is `""` when both sources are null.
- `contextDrift`: no drift when the overview has no version of a source. Drift when the step used no version or an older one. No drift when it used the same version or a later one.
- Concurrency: every export is pure and synchronous with no shared mutable state, so there are no `@concurrency` scenarios.
- Outside the seam, `STARTER_TOOL_VERSION` becomes `"sandbox_starter@3"`, and `index.ts` re-exports `sources.ts`.
