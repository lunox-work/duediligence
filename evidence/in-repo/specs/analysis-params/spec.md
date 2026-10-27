# Analysis vocabulary, watchdog retry rule and canonical JSON

Repository snapshots (`docs/architecture.md`, "Every head is snapshotted")
are to be analyzed by a private Graphify worker. The jobs, their failures and
the artifacts they upload are recorded by other packages, but the words those
records use and the two pure rules they share belong in `packages/core`, which
stays dependency-free so the same code bundles for the browser and for Node.
This change adds a new module, `packages/core/src/analysis.ts`, holding:

- the closed lists of analysis statuses, error codes and artifact kinds, and
  the tool version an analysis records;
- `expiredAnalysis`, which decides what the watchdog does with an analysis
  whose worker lost its lease: put it back in the queue for another attempt,
  or fail it (the caller records `worker_lost`, as `failExpired` does for
  bounty runs);
- `canonicalJson`, one fixed JSON encoding of plain data, so that two workers
  serializing the same manifest get the same bytes and the same hash.

## Exports of `packages/core/src/analysis.ts`

These are used exactly as the ticket gives them:

```ts
export const ANALYSIS_STATUSES = ["queued", "running", "succeeded", "failed"] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const ANALYSIS_ERROR_CODES = [
  "too_large", "too_many_files", "source_unavailable", "tool_failed",
  "tool_timeout", "upload_failed", "worker_lost", "cancelled",
] as const;
export type AnalysisErrorCode = (typeof ANALYSIS_ERROR_CODES)[number];

export const ARTIFACT_KINDS = [
  "graph_json", "graph_html", "report_md", "wiki_page", "manifest", "other",
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const GRAPHIFY_TOOL_VERSION = "graphifyy@0.4.18+driver-1";

export interface AnalysisParams {
  readonly deadlineMinutes: number;
}

export function expiredAnalysis(attempt: number, maxAttempts: number): {
  status: "queued" | "failed";
  attempt: number;
};

export function canonicalJson(value: unknown): string;
```

- The three lists are plain `as const` arrays in the order shown, and are not
  frozen at runtime, like `WHOLE_BOUNTY_COMPLEXITIES` in `bounty.ts`.
- `AnalysisParams` is a type only. It has no runtime counterpart and this
  change adds no validator for it.
- The module imports nothing: no Node built-ins and no other package.
- `packages/core/src/index.ts` adds `export * from "./analysis.js";` after the
  existing lines. All existing exports (`handle`, `bounty`, `selection`,
  `pricing`, `repo`) keep their names and behaviour. None of the new names
  clash with an existing export.
- Both functions are pure and synchronous. They hold no state between calls
  and never modify their arguments.

```gherkin
Feature: Analysis vocabulary, watchdog retry rule and canonical JSON

  Background:
    Given the exports of "packages/core/src/analysis.ts"

  Rule: The vocabulary lists hold exactly the ticket's values, in the ticket's order

    @happy
    Scenario: Each list holds its values in order
      Then each constant deep-equals its list:
        | constant             | values                                                                                                  |
        | ANALYSIS_STATUSES    | queued, running, succeeded, failed                                                                      |
        | ANALYSIS_ERROR_CODES | too_large, too_many_files, source_unavailable, tool_failed, tool_timeout, upload_failed, worker_lost, cancelled |
        | ARTIFACT_KINDS       | graph_json, graph_html, report_md, wiki_page, manifest, other                                           |

    @happy
    Scenario: The tool version is pinned
      Then GRAPHIFY_TOOL_VERSION equals "graphifyy@0.4.18+driver-1"

    @happy
    Scenario: The package entry point re-exports the module
      When the names are imported from "packages/core/src/index.ts"
      Then ANALYSIS_STATUSES, ANALYSIS_ERROR_CODES, ARTIFACT_KINDS, GRAPHIFY_TOOL_VERSION, expiredAnalysis and canonicalJson are the same values that "analysis.ts" exports

    @happy
    Scenario: AnalysisParams takes a deadline in minutes
      Given a value typed AnalysisParams equal to { deadlineMinutes: 30 }
      Then it type-checks and its deadlineMinutes is 30

  Rule: An expired attempt is requeued as the next attempt while attempts remain, and is otherwise failed as the attempt it was

    # `attempt` is the 1-based number of the attempt whose lease expired.
    # `maxAttempts` is how many attempts the analysis may have in all.
    # When attempt < maxAttempts the result is { status: "queued", attempt: attempt + 1 },
    # where the returned attempt is the number the next run will have.
    # Otherwise the result is { status: "failed", attempt }, with attempt unchanged.

    @happy
    Scenario Outline: The watchdog's decision for an expired attempt
      When expiredAnalysis(<attempt>, <maxAttempts>) is called
      Then the result deep-equals { status: "<status>", attempt: <result> }

      Examples:
        | attempt | maxAttempts | status | result |
        | 1       | 3           | queued | 2      |
        | 2       | 3           | queued | 3      |
        | 3       | 3           | failed | 3      |

    @boundary
    Scenario Outline: Attempts at the edges of the limit
      When expiredAnalysis(<attempt>, <maxAttempts>) is called
      Then the result deep-equals { status: "<status>", attempt: <result> }

      Examples:
        | attempt                     | maxAttempts             | status | result                  |
        | 1                           | 1                       | failed | 1                       |
        | 1                           | 2                       | queued | 2                       |
        | 5                           | 3                       | failed | 5                       |
        | Number.MAX_SAFE_INTEGER - 1 | Number.MAX_SAFE_INTEGER | queued | Number.MAX_SAFE_INTEGER |
        | Number.MAX_SAFE_INTEGER     | Number.MAX_SAFE_INTEGER | failed | Number.MAX_SAFE_INTEGER |

    # The 5-of-3 row is an analysis that ran past a limit that was later lowered.
    # It fails and is not rejected.

    @boundary
    Scenario: Each call returns a new object
      When expiredAnalysis(1, 3) is called twice
      Then the two results deep-equal each other and are not the same object

  Rule: expiredAnalysis accepts only positive safe integers and throws a RangeError otherwise

    # attempt is checked before maxAttempts. The messages are exactly
    # "attempt must be a positive safe integer" and
    # "maxAttempts must be a positive safe integer".

    @unhappy
    Scenario Outline: An invalid attempt is refused
      When expiredAnalysis(<attempt>, 3) is called
      Then it throws a RangeError with message "attempt must be a positive safe integer"

      Examples:
        | attempt                     |
        | 0                           |
        | -1                          |
        | 1.5                         |
        | NaN                         |
        | Infinity                    |
        | Number.MAX_SAFE_INTEGER + 1 |

    @unhappy
    Scenario Outline: An invalid maxAttempts is refused
      When expiredAnalysis(1, <maxAttempts>) is called
      Then it throws a RangeError with message "maxAttempts must be a positive safe integer"

      Examples:
        | maxAttempts |
        | 0           |
        | -3          |
        | 2.5         |
        | NaN         |
        | Infinity    |

    @unhappy
    Scenario: When both arguments are invalid, the attempt is reported
      When expiredAnalysis(0, 0) is called
      Then it throws a RangeError with message "attempt must be a positive safe integer"

  Rule: canonicalJson writes plain data as compact JSON with object keys sorted by UTF-16 code units

    # No whitespace anywhere. Arrays keep their order. Each object's own
    # enumerable string keys are sorted by UTF-16 code unit, the order the
    # default Array.prototype.sort gives, at every depth. Strings and numbers
    # are written exactly as JSON.stringify writes them: non-ASCII is not
    # escaped, lone surrogates become lowercase \uXXXX escapes, -0 becomes 0
    # and 1e21 becomes 1e+21. Symbol keys are ignored. Non-index properties
    # of an array are ignored.

    @happy
    Scenario Outline: Values are written compactly
      When canonicalJson(<value>) is called
      Then it returns '<json>'

      Examples:
        | value                                   | json                          |
        | null                                    | null                          |
        | true                                    | true                          |
        | 42                                      | 42                            |
        | "héllo"                                 | "héllo"                       |
        | [3, 1, 2]                               | [3,1,2]                       |
        | { b: 1, a: [true, null], c: "x" }       | {"a":[true,null],"b":1,"c":"x"} |
        | { z: { y: 1, x: 2 }, a: [] }            | {"a":[],"z":{"x":2,"y":1}}    |
        | {}                                      | {}                            |

    @happy
    Scenario: Key order in the input does not change the output
      Given a = { b: 1, a: [true, null], c: "x" }
      And b = { c: "x", a: [true, null], b: 1 }
      Then canonicalJson(a) and canonicalJson(b) both return '{"a":[true,null],"b":1,"c":"x"}'

    @boundary
    Scenario: Keys sort by code unit, not numerically or by code point
      When canonicalJson is called with an object whose keys and values are:
        | key  | value |
        | b    | 1     |
        | a    | 2     |
        | B    | 3     |
        | 10   | 4     |
        | 9    | 5     |
        | ｚ   | 6     |
        | 😀   | 7     |
        | é    | 8     |
      Then it returns '{"10":4,"9":5,"B":3,"a":2,"b":1,"é":8,"😀":7,"ｚ":6}'

    # "10" comes before "9", which is not the integer-key order JavaScript
    # enumerates in. "😀" (U+D83D U+DE00) comes before "ｚ" (U+FF5A), which is
    # not code-point order.

    @boundary
    Scenario Outline: Numbers and strings follow JSON.stringify
      When canonicalJson(<value>) is called
      Then it returns '<json>'

      Examples:
        | value          | json                  |
        | -0             | 0                     |
        | 1e21           | 1e+21                 |
        | 0.1 + 0.2      | 0.30000000000000004   |
        | "\u0001"       | "\u0001"              |
        | "a\"b\\c\n"    | "a\"b\\c\n"           |
        | "\ud800"       | "\ud800"              |

    @boundary
    Scenario: Object properties whose value is undefined are left out
      When canonicalJson({ b: undefined, a: 1 }) is called
      Then it returns '{"a":1}'

    @boundary
    Scenario: An object with no prototype is accepted
      Given o = Object.create(null) with o.b = 2 and o.a = 1
      Then canonicalJson(o) returns '{"a":1,"b":2}'

    @boundary
    Scenario: Symbol keys and extra array properties are ignored
      Given o = { a: 1, [Symbol("s")]: 2 }
      And arr = [1, 2] with arr.extra = 3
      Then canonicalJson(o) returns '{"a":1}'
      And canonicalJson(arr) returns '[1,2]'

    @boundary
    Scenario: A value shared by two branches but not cyclic is written at both places
      Given shared = { k: 1 }
      Then canonicalJson({ x: shared, y: [shared] }) returns '{"x":{"k":1},"y":[{"k":1}]}'

    @happy
    Scenario: The input is not modified
      Given input = { b: [2, 1], a: { d: 1, c: 2 } }
      When canonicalJson(input) is called
      Then Object.keys(input) is still ["b", "a"]
      And input.b is still [2, 1]
      And Object.keys(input.a) is still ["d", "c"]

  Rule: canonicalJson throws a TypeError for anything that is not plain JSON data

    # Accepted values are null, booleans, finite numbers, strings, arrays, and
    # objects whose prototype is Object.prototype or null. A property value of
    # undefined on such an object is left out (see the rule above). Everything
    # else throws a TypeError, wherever it appears, including nested ones,
    # an undefined array element and an array hole. toJSON is never called.
    # The message is exactly "canonicalJson cannot encode <what>":

    @unhappy
    Scenario Outline: Values that are not plain data are refused
      When canonicalJson(<value>) is called
      Then it throws a TypeError with message "canonicalJson cannot encode <what>"

      Examples:
        | value                    | what                  |
        | undefined                | undefined             |
        | [1, undefined]           | undefined             |
        | [1, , 3]                 | undefined             |
        | () => 1                  | a function            |
        | { f: () => 1 }           | a function            |
        | Symbol("s")              | a symbol              |
        | 10n                      | a bigint              |
        | { n: 10n }               | a bigint              |
        | NaN                      | a non-finite number   |
        | [Infinity]               | a non-finite number   |
        | { n: -Infinity }         | a non-finite number   |
        | new Date(0)              | a non-plain object    |
        | new Map()                | a non-plain object    |
        | new String("x")          | a non-plain object    |
        | { d: new Date(0) }       | a non-plain object    |
        | { toJSON: () => 1 }      | a function            |

    # The last row shows that toJSON is not special: it is a function-valued
    # property like any other.

    @unhappy
    Scenario: A cyclic structure is refused
      Given o = { a: 1 } with o.self = o
      When canonicalJson(o) is called
      Then it throws a TypeError with message "canonicalJson cannot encode a cyclic structure"

    @unhappy
    Scenario: A cycle through an array is refused
      Given arr = [] with arr.push(arr)
      When canonicalJson(arr) is called
      Then it throws a TypeError with message "canonicalJson cannot encode a cyclic structure"
```

Decided:
- Meaning of `attempt`: the 1-based number of the attempt whose lease expired. A requeue returns `attempt + 1`, the next attempt's number. A failure returns `attempt` unchanged.
- Requeue boundary: requeue when `attempt < maxAttempts`, otherwise fail. So `maxAttempts` is the total number of attempts allowed.
- `attempt > maxAttempts` (the limit was lowered): fail with `attempt` unchanged. It is not rejected.
- Invalid `expiredAnalysis` arguments (not a positive safe integer): throw a `RangeError` with fixed messages, checking `attempt` first. The return type has no null case, so it cannot return null the way `parseMinorUnits` does.
- `canonicalJson` key order: own enumerable string keys sorted by UTF-16 code unit at every depth, the JCS (RFC 8785) convention.
- `canonicalJson` layout: no whitespace, arrays in order, strings and numbers exactly as `JSON.stringify` writes them (`-0` → `0`, non-ASCII unescaped, lone surrogates escaped).
- Values `canonicalJson` refuses: undefined (except as an object property value, which is left out), array holes, functions, symbols, bigints, non-finite numbers, non-plain objects (Date, Map, boxed primitives, class instances) and cycles. Each throws a `TypeError` with a fixed message.
- `toJSON` is not called. Symbol keys and non-index array properties are ignored. A non-cyclic shared reference is written each place it appears.
- `AnalysisParams` stays a type only, with no validator, because the ticket gives none.
- The vocabulary arrays are not frozen at runtime, matching `bounty.ts`.
- `index.ts` re-exports the new module, as it does every other core module.
- No `@concurrency` scenarios: both functions are synchronous and stateless, so calls cannot overlap.
