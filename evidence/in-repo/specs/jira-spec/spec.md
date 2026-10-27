# Read a Jira ticket's spec and fingerprint it

Ticket #27 adds `packages/jira/src/spec.ts`. It turns the `fields` block of a
Jira issue into a `JiraIssueSpec`: the ticket's key, summary, description as
plain text, issue type and last-updated stamp, plus a `specHash` that changes
only when the summary or the description text changes. Callers use the hash to
tell whether a ticket's spec changed since they last read it. Jira's REST API v3
(`/rest/api/3`, which `JiraClient.issue` uses) sends `description` as an
Atlassian Document Format (ADF) tree. Older endpoints send a plain string, and
either can be `null`. The module reads them the way `mapping.ts` does:
it never throws on a missing or malformed field. It uses a sensible default
instead. Like the rest of the package it is platform-neutral, with no `node:`
imports. Hashing uses the web-standard `globalThis.crypto.subtle` and
`TextEncoder`, which is why `specHash` is async.

## Exports

From `packages/jira/src/spec.ts`, exactly as the ticket gives them:

```ts
export interface JiraIssueSpec {
    readonly key: string;
    readonly summary: string;
    readonly descriptionText: string;
    readonly issueType: string;
    readonly updated: string | null;
    readonly specHash: string;
}

export const SPEC_FIELDS: readonly string[] = [
    "summary",
    "description",
    "issuetype",
    "updated",
];

export async function specHash(summary: string, descriptionText: string): Promise<string>;

export async function toIssueSpec(key: string, fields: {
    summary?: unknown;
    description?: unknown;
    issuetype?: {
        name?: unknown;
    } | null;
    updated?: unknown;
}): Promise<JiraIssueSpec>;
```

`packages/jira/src/index.ts` also re-exports `SPEC_FIELDS`, `specHash` and
`toIssueSpec`, and exports the type `JiraIssueSpec`.

No other export changes. `ISSUE_FIELDS`, `toIssueDto`, `toBoardDto`,
`toSprintDto`, `stripTrailingSlashes`, `JiraClient` and everything in
`credentials.ts` and `oauth.ts` behave as before. In particular `ISSUE_FIELDS`
stays the same 11 fields and does not gain `"description"`.

## Definitions used below

- **sha256hex(s)**: the SHA-256 digest of the UTF-8 encoding of the string `s`,
  written as 64 lowercase hexadecimal characters with no prefix.
- **ADF node**: any non-null, non-array object. Its `type`, `text`, `attrs` and
  `content` members are read only when they have the type given below and are
  ignored otherwise.
- **Textblock types**: `paragraph`, `heading`, `codeBlock`, `taskItem`,
  `decisionItem`. These hold inline content, so their children are joined with
  no separator. All other node types are joined with `"\n"`, and that includes
  `doc`, lists, list items, blockquotes, panels, tables, unknown types and
  nodes with no `type`.
- **Text of an ADF node**, decided by its `type`:

  | `type`        | text                                                              |
  | ------------- | ----------------------------------------------------------------- |
  | `text`        | `text` if it is a string, else `""`                               |
  | `hardBreak`   | `"\n"`                                                            |
  | `mention`     | `attrs.text` if it is a string, else `""`                         |
  | `emoji`       | `attrs.text` if it is a string, else `attrs.shortName` if it is a string, else `""` |
  | `inlineCard`  | `attrs.url` if it is a string, else `""`                          |
  | anything else | if `content` is an array: the texts of the children that are ADF nodes, in order, joined with `""` for a textblock type and `"\n"` otherwise; if not: `""` |

  Items in `content` that are not ADF nodes (strings, numbers, `null`, arrays)
  are skipped. They add no text and no separator. `marks` and every other
  member are ignored. Nothing is trimmed, collapsed or normalised. An empty
  child still counts as a child, so it still gets a separator.

```gherkin
Feature: Read a Jira issue's spec and fingerprint it

  Background:
    Given the exports of "packages/jira/src/spec.ts"

  Rule: SPEC_FIELDS lists exactly the Jira fields toIssueSpec reads, in this order

    @happy
    Scenario: SPEC_FIELDS is the four spec fields
      When SPEC_FIELDS is read
      Then it deep-equals ["summary", "description", "issuetype", "updated"]

    @happy
    Scenario: ISSUE_FIELDS is unchanged by this feature
      When ISSUE_FIELDS is read from "packages/jira/src/mapping.ts"
      Then it deep-equals ["summary", "status", "assignee", "priority", "issuetype", "labels", "created", "updated", "duedate", "parent", "project"]

  Rule: specHash is sha256hex(JSON.stringify([summary, descriptionText])), 64 lowercase hex characters

    @happy
    Scenario Outline: Known inputs give known hashes
      When specHash(<summary>, <descriptionText>) is awaited
      Then it resolves to "<hash>"

      Examples:
        | summary         | descriptionText          | hash                                                             |
        | "Add login"     | "Users can sign in."     | 8a71edd3e48141d9e972a05a5e3315c9f55609fc4cf20abdd24dd1e606fb9e14 |
        | "Fix the build" | "Line one\nLine two"     | 72cf51e53aee072c65b91b674e5d50ac48290bacff428cc88d992e91a1a95448 |
        | "Café"          | "naïve 🙂"               | a93b9fdb1a30dfc0a6307d99102751b73870085e7313125e285a213000c5ee22 |

    @boundary
    Scenario: Two empty strings still hash
      When specHash("", "") is awaited
      Then it resolves to "439083f38956ba51ece90631552c6ea23c5c29570d3d5710e408e77e01ba7375"

    @happy
    Scenario: The result always has the hex digest's shape
      When specHash("Add login", "Users can sign in.") is awaited
      Then the result matches /^[0-9a-f]{64}$/

    @happy
    Scenario: The same inputs always give the same hash
      When specHash("Add login", "Users can sign in.") is awaited twice
      Then both results are equal

    @boundary
    Scenario: Moving text across the summary/description boundary changes the hash
      When specHash("a\nb", "c") is awaited
      And specHash("a", "b\nc") is awaited
      Then the first resolves to "869e4af18a4b82a0856c905a9c25769eb10717cde11b56afaffb0ea154a2eb0b"
      And the second resolves to "ba97b7d634f693473f1d2cbc1958df5d48dcdfcda942d8ce41a25a5c3651e736"

    @boundary
    Scenario: Whitespace is significant: nothing is trimmed before hashing
      When specHash("Add login", "Users can sign in. ") is awaited
      Then it resolves to "cdb938f0f89d645b195ccc32746bf778a91b6f27e4555621a422e3a1028ef27a"
      And that differs from specHash("Add login", "Users can sign in.")

    @boundary
    Scenario: Unicode is hashed as given, without normalisation
      When specHash("Café", "") and specHash("Café", "") are awaited
      Then the two results differ

  Rule: specHash rejects a non-string argument with a TypeError

    @unhappy
    Scenario Outline: A non-string argument rejects
      When specHash(<summary>, <descriptionText>) is awaited, with the types bypassed
      Then the promise rejects with a TypeError
      And the message names the argument "<argument>"

      Examples:
        | summary   | descriptionText | argument        |
        | undefined | ""              | summary         |
        | 42        | ""              | summary         |
        | ""        | null            | descriptionText |
        | ""        | { }             | descriptionText |

  Rule: Concurrent specHash calls are independent

    @concurrency
    Scenario: Overlapping calls each resolve to their own input's hash
      When these are started together and awaited with Promise.all:
        | summary         | descriptionText      |
        | "Add login"     | "Users can sign in." |
        | ""              | ""                   |
        | "Fix the build" | "Line one\nLine two" |
      Then the results are, in the same order:
        | hash                                                             |
        | 8a71edd3e48141d9e972a05a5e3315c9f55609fc4cf20abdd24dd1e606fb9e14 |
        | 439083f38956ba51ece90631552c6ea23c5c29570d3d5710e408e77e01ba7375 |
        | 72cf51e53aee072c65b91b674e5d50ac48290bacff428cc88d992e91a1a95448 |

  Rule: toIssueSpec returns exactly the six JiraIssueSpec keys, with specHash equal to specHash(summary, descriptionText)

    @happy
    Scenario: A complete v3 issue becomes a spec
      Given fields:
        """
        {
          "summary": "Add login",
          "description": {
            "type": "doc", "version": 1,
            "content": [
              { "type": "paragraph", "content": [ { "type": "text", "text": "Users can sign in." } ] }
            ]
          },
          "issuetype": { "name": "Story" },
          "updated": "2026-10-20T09:15:00.000+0000"
        }
        """
      When toIssueSpec("ACME-123", fields) is awaited
      Then the result deep-equals:
        | key             | ACME-123                                                         |
        | summary         | Add login                                                        |
        | descriptionText | Users can sign in.                                               |
        | issueType       | Story                                                            |
        | updated         | 2026-10-20T09:15:00.000+0000                                     |
        | specHash        | 8a71edd3e48141d9e972a05a5e3315c9f55609fc4cf20abdd24dd1e606fb9e14 |
      And Object.keys of the result are exactly key, summary, descriptionText, issueType, updated, specHash

    @happy
    Scenario: The key is passed through verbatim
      When toIssueSpec("acme-7", { "summary": "x" }) is awaited
      Then key is "acme-7"

    @happy
    Scenario: The input fields object is not modified
      Given fields { "summary": "Add login", "description": "Users can sign in.", "issuetype": { "name": "Bug" }, "updated": null }
      When toIssueSpec("ACME-1", fields) is awaited
      Then fields still deep-equals { "summary": "Add login", "description": "Users can sign in.", "issuetype": { "name": "Bug" }, "updated": null }

    @happy
    Scenario: Issue type and updated stamp do not affect the hash
      Given fields A { "summary": "Add login", "description": "Users can sign in.", "issuetype": { "name": "Story" }, "updated": "2026-10-20T09:15:00.000+0000" }
      And fields B { "summary": "Add login", "description": "Users can sign in.", "issuetype": { "name": "Bug" }, "updated": "2026-10-24T17:00:00.000+0000" }
      When toIssueSpec("ACME-1", A) and toIssueSpec("ACME-2", B) are awaited
      Then both specHash values are "8a71edd3e48141d9e972a05a5e3315c9f55609fc4cf20abdd24dd1e606fb9e14"

  Rule: summary is used verbatim when it is a string, otherwise it becomes ""

    @boundary
    Scenario Outline: summary values
      When toIssueSpec("ACME-1", { "summary": <summary> }) is awaited
      Then summary is <result>

      Examples:
        | summary          | result           |
        | "  Add login  "  | "  Add login  "  |
        | ""               | ""               |
        | absent           | ""               |
        | null             | ""               |
        | 42               | ""               |
        | ["Add login"]    | ""               |

  Rule: issueType is issuetype.name when it is a string, otherwise "Task", the same default toIssueDto uses

    @boundary
    Scenario Outline: issuetype values
      When toIssueSpec("ACME-1", { "issuetype": <issuetype> }) is awaited
      Then issueType is <result>

      Examples:
        | issuetype          | result  |
        | { "name": "Bug" }  | "Bug"   |
        | { "name": "" }     | ""      |
        | { }                | "Task"  |
        | { "name": null }   | "Task"  |
        | { "name": 3 }      | "Task"  |
        | null               | "Task"  |
        | absent             | "Task"  |

  Rule: updated is used verbatim when it is a string, otherwise it is null

    @boundary
    Scenario Outline: updated values
      When toIssueSpec("ACME-1", { "updated": <updated> }) is awaited
      Then updated is <result>

      Examples:
        | updated                         | result                          |
        | "2026-10-20T09:15:00.000+0000"  | "2026-10-20T09:15:00.000+0000"  |
        | "not a date"                    | "not a date"                    |
        | ""                              | ""                              |
        | null                            | null                            |
        | absent                          | null                            |
        | 1729415700000                   | null                            |

  Rule: A string description is used verbatim, an ADF node is flattened to its text, anything else becomes ""

    @happy
    Scenario: A plain-string description, as older endpoints send it, is kept exactly
      When toIssueSpec("ACME-1", { "summary": "Fix the build", "description": "Line one\nLine two" }) is awaited
      Then descriptionText is "Line one\nLine two"
      And specHash is "72cf51e53aee072c65b91b674e5d50ac48290bacff428cc88d992e91a1a95448"

    @boundary
    Scenario: Carriage returns and surrounding whitespace in a string description are not normalised
      When toIssueSpec("ACME-1", { "description": "  a\r\nb  " }) is awaited
      Then descriptionText is "  a\r\nb  "

    @boundary
    Scenario Outline: A description that is neither a string nor an ADF node becomes ""
      When toIssueSpec("ACME-1", { "summary": "", "description": <description> }) is awaited
      Then descriptionText is ""
      And specHash is "439083f38956ba51ece90631552c6ea23c5c29570d3d5710e408e77e01ba7375"

      Examples:
        | description |
        | absent      |
        | null        |
        | 42          |
        | true        |
        | ["text"]    |

    @happy
    Scenario Outline: ADF documents flatten to text
      When toIssueSpec("ACME-1", { "description": <description> }) is awaited
      Then descriptionText is <text>

      Examples:
        | case                              | description | text |
        | one paragraph                     | {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello"}]}]} | "Hello" |
        | marked runs join with no gap      | {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello "},{"type":"text","text":"world","marks":[{"type":"strong"}]}]}]} | "Hello world" |
        | paragraphs join with a newline    | {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"First"}]},{"type":"paragraph","content":[{"type":"text","text":"Second"}]}]} | "First\nSecond" |
        | hard break is a newline           | {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"line one"},{"type":"hardBreak"},{"type":"text","text":"line two"}]}]} | "line one\nline two" |
        | heading then paragraph            | {"type":"doc","content":[{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Goal"}]},{"type":"paragraph","content":[{"type":"text","text":"Ship it"}]}]} | "Goal\nShip it" |
        | bullet list items, one per line   | {"type":"doc","content":[{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"a"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"b"}]}]}]}]} | "a\nb" |
        | code block keeps its own newlines | {"type":"doc","content":[{"type":"codeBlock","attrs":{"language":"sh"},"content":[{"type":"text","text":"npm ci\nnpm test"}]}]} | "npm ci\nnpm test" |
        | mention uses attrs.text           | {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"ask "},{"type":"mention","attrs":{"id":"123","text":"@Ann"}}]}]} | "ask @Ann" |
        | emoji uses attrs.text             | {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"ok "},{"type":"emoji","attrs":{"shortName":":smile:","text":"😄"}}]}]} | "ok 😄" |
        | emoji falls back to shortName     | {"type":"doc","content":[{"type":"paragraph","content":[{"type":"emoji","attrs":{"shortName":":smile:"}}]}]} | ":smile:" |
        | inline card uses attrs.url        | {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"see "},{"type":"inlineCard","attrs":{"url":"https://acme.atlassian.net/browse/ACME-9"}}]}]} | "see https://acme.atlassian.net/browse/ACME-9" |
        | task items hold inline content    | {"type":"doc","content":[{"type":"taskList","content":[{"type":"taskItem","content":[{"type":"text","text":"do "},{"type":"text","text":"this"}]},{"type":"taskItem","content":[{"type":"text","text":"then that"}]}]}]} | "do this\nthen that" |
        | unknown inline node adds nothing  | {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"State: "},{"type":"status","attrs":{"text":"DONE"}},{"type":"text","text":" ok"}]}]} | "State:  ok" |
        | a root that is not a doc          | {"type":"paragraph","content":[{"type":"text","text":"bare"}]} | "bare" |

    @boundary
    Scenario Outline: Empty and degenerate ADF
      When toIssueSpec("ACME-1", { "description": <description> }) is awaited
      Then descriptionText is <text>

      Examples:
        | case                                         | description | text |
        | empty doc                                    | {"type":"doc","version":1,"content":[]} | "" |
        | doc with no content member                   | {"type":"doc","version":1} | "" |
        | empty object                                 | {} | "" |
        | an empty paragraph still gets its separators | {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"a"}]},{"type":"paragraph"},{"type":"paragraph","content":[{"type":"text","text":"b"}]}]} | "a\n\nb" |
        | a rule is an empty block                     | {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"a"}]},{"type":"rule"},{"type":"paragraph","content":[{"type":"text","text":"b"}]}]} | "a\n\nb" |
        | whitespace is not trimmed                    | {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"  padded  "}]}]} | "  padded  " |

    @unhappy
    Scenario Outline: Malformed ADF members are ignored rather than thrown on
      When toIssueSpec("ACME-1", { "description": <description> }) is awaited
      Then it resolves without throwing
      And descriptionText is <text>

      Examples:
        | case                                   | description | text |
        | non-node items in content are skipped  | {"type":"doc","content":["x",null,7,[],{"type":"paragraph","content":[{"type":"text","text":"a"}]}]} | "a" |
        | text that is not a string              | {"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":42}]}]} | "" |
        | content that is not an array           | {"type":"doc","content":{"type":"paragraph"}} | "" |
        | node with no type joins with newlines  | {"content":[{"type":"text","text":"a"},{"type":"text","text":"b"}]} | "a\nb" |
        | mention without attrs                  | {"type":"doc","content":[{"type":"paragraph","content":[{"type":"mention"}]}]} | "" |
        | inlineCard with a non-string url       | {"type":"doc","content":[{"type":"paragraph","content":[{"type":"inlineCard","attrs":{"url":5}}]}]} | "" |
        | text node's own content is ignored     | {"type":"text","text":"x","content":[{"type":"text","text":"y"}]} | "x" |

    @boundary
    Scenario: Deeply nested ADF does not overflow the stack
      Given an ADF description of 100000 nested "blockquote" nodes, each with the next as its only content item, and the innermost holding one paragraph with text "deep"
      When toIssueSpec("ACME-1", { "description": description }) is awaited
      Then it resolves without throwing
      And descriptionText is "deep"

  Rule: Missing or null fields yield a spec of defaults rather than an error

    @boundary
    Scenario Outline: An empty fields block
      When toIssueSpec("ACME-1", <fields>) is awaited, with the types bypassed where needed
      Then the result deep-equals:
        | key             | ACME-1                                                           |
        | summary         |                                                                  |
        | descriptionText |                                                                  |
        | issueType       | Task                                                             |
        | updated         | null                                                             |
        | specHash        | 439083f38956ba51ece90631552c6ea23c5c29570d3d5710e408e77e01ba7375 |

      Examples:
        | fields    |
        | {}        |
        | null      |
        | undefined |

  Rule: Concurrent toIssueSpec calls are independent

    @concurrency
    Scenario: Overlapping calls each resolve to their own issue's spec
      When toIssueSpec("ACME-1", { "summary": "Add login", "description": "Users can sign in." }) and toIssueSpec("ACME-2", { "summary": "Fix the build", "description": "Line one\nLine two" }) are started together and awaited with Promise.all
      Then the first has key "ACME-1" and specHash "8a71edd3e48141d9e972a05a5e3315c9f55609fc4cf20abdd24dd1e606fb9e14"
      And the second has key "ACME-2" and specHash "72cf51e53aee072c65b91b674e5d50ac48290bacff428cc88d992e91a1a95448"

  Rule: The package index re-exports the new surface

    @happy
    Scenario: The spec exports are reachable from the package entry point
      When "packages/jira/src/index.ts" is imported
      Then SPEC_FIELDS, specHash and toIssueSpec are the same values as those exported by "packages/jira/src/spec.ts"
```

Decided:

- Hash algorithm and format: SHA-256 through `crypto.subtle`, written as 64 lowercase hex characters with no prefix.
- Hash input encoding: UTF-8 of `JSON.stringify([summary, descriptionText])`, so text moved between the two fields cannot collide.
- Hash scope: only the summary and the description text count. Key, issue type and `updated` do not change it.
- No trimming, whitespace collapsing, line-ending or Unicode normalisation, before or during hashing.
- `specHash` with a non-string argument rejects with a `TypeError` that names the argument.
- Missing or non-string `summary` becomes `""`, not `toIssueDto`'s `"(no summary)"` placeholder, so placeholder text never lands in the spec or the hash.
- Missing or non-string `issuetype.name` becomes `"Task"`, matching `toIssueDto`. An empty string is kept.
- Non-string `updated` becomes `null`. Strings pass through unvalidated.
- `key` is passed through verbatim, with no validation.
- `fields` of `null` or `undefined` is treated as `{}`.
- Description: a string is kept verbatim, an object is read as ADF, and anything else becomes `""`.
- ADF flattening: the per-type text table above. Children of textblock types join with `""`, all other nodes join with `"\n"`. Unknown inline nodes add nothing. Non-node `content` items are skipped.
- ADF nesting: 100,000 levels must flatten without a stack overflow.
- The result has exactly six own keys, and the input `fields` object is not mutated.
- Concurrent calls share no state, and each resolves to the result of its own input.
- `ISSUE_FIELDS` is unchanged. `index.ts` re-exports the new values and the type.
