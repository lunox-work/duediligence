# Native tickets: one definition of ticket content, limits, keys and the spec hash

Tickets can now be written in the platform ("manual") as well as read from
Jira ("jira"), and both kinds are priced. Today the rules for a ticket's text
live in `packages/jira/src/spec.ts`, so a native ticket has nowhere to take
them from. This change adds a new dependency-free module,
`packages/core/src/ticket.ts`, that owns them once: the ticket origins, the
ticket limits, the default issue type, title clamping, the shape of a
ticket's content, the spec-text normalization, the pricing fingerprint
(`ticketSpecHash`, which **is** the existing Jira `pricingSpecHash`: same
inputs, same 64-character hex, so every stored hash stays valid) and the
display key of a ticket. `packages/core/src/index.ts` gains
`export * from "./ticket.js";` and nothing else changes in `packages/core`.

## Exports of `packages/core/src/ticket.ts`

```ts
/** Where a ticket came from: written here, or read from Jira. */
export const TICKET_ORIGINS = ["manual", "jira"] as const;
export type TicketOrigin = (typeof TICKET_ORIGINS)[number];

/** Caps on a ticket's fields, in UTF-16 code units (`String.length`) or entries. */
export const TICKET_LIMITS: Readonly<{
  titleMaxChars: 255;
  descriptionMaxChars: 20_000;
  issueTypeMaxChars: 60;
  priorityMaxChars: 60;
  labelMaxChars: 255;
  maxLabels: 20;
  componentMaxChars: 255;
  maxComponents: 20;
}> = Object.freeze({
  titleMaxChars: 255,
  descriptionMaxChars: 20_000,
  issueTypeMaxChars: 60,
  priorityMaxChars: 60,
  labelMaxChars: 255,
  maxLabels: 20,
  componentMaxChars: 255,
  maxComponents: 20,
});

/** The issue type a ticket has when it names none (Jira's own fallback). */
export const DEFAULT_ISSUE_TYPE = "Task";

export function clampTicketTitle(title: string): string;

export interface TicketContent {
  readonly title: string;
  readonly description: string;
  readonly issueType: string;
  readonly priority: string | null;
  readonly labels: readonly string[];
  readonly components: readonly string[];
  readonly inputTruncated: boolean;
}

/** The version of the fingerprint `ticketSpecHash` produces (stored as `specHashVersion`). */
export const TICKET_SPEC_HASH_VERSION = 1;

export async function ticketSpecHash(
  title: string,
  description: string,
  issueType: string,
): Promise<string>;

export function normalizeSpecText(value: string): string;

export function ticketKey(ticket: {
  readonly number: number;
  readonly jiraKey?: string | null | undefined;
}): string;
```

- `TicketContent` is a type only; it has no runtime behaviour. `labels` and
  `components` are not part of any hash.
- `ticketSpecHash` uses `crypto.subtle.digest("SHA-256", …)` over
  `new TextEncoder().encode(JSON.stringify([normalizeSpecText(title),
  normalizeSpecText(description), normalizeSpecText(issueType)]))` and returns
  the digest as lowercase hex. It must not import `node:crypto`.
- Every existing export of `packages/core` (`handle`, `bounty`, `selection`,
  `pricing`, `repo`, `analysis`, `slice`, `sandbox`) keeps its name, signature
  and behaviour; none of them is renamed or moved by this change.

```gherkin
Feature: Ticket content rules shared by native and Jira tickets
  Every surface takes a ticket's origins, limits, default issue type,
  title clamp, spec normalization, pricing fingerprint and display key
  from packages/core/src/ticket.ts.

  Rule: The constants have one fixed definition

    @happy
    Scenario: The origins are manual then jira
      When TICKET_ORIGINS is read
      Then it equals ["manual", "jira"] in that order

    @happy
    Scenario: The default issue type and the hash version
      Then DEFAULT_ISSUE_TYPE equals "Task"
      And TICKET_SPEC_HASH_VERSION equals 1

    @happy
    Scenario: The ticket limits
      When TICKET_LIMITS is read
      Then it deep-equals exactly these keys and values
        | key                 | value |
        | titleMaxChars       | 255   |
        | descriptionMaxChars | 20000 |
        | issueTypeMaxChars   | 60    |
        | priorityMaxChars    | 60    |
        | labelMaxChars       | 255   |
        | maxLabels           | 20    |
        | componentMaxChars   | 255   |
        | maxComponents       | 20    |

    @unhappy
    Scenario: The ticket limits cannot be changed at run time
      When Object.isFrozen(TICKET_LIMITS) is called
      Then it returns true
      And assigning TICKET_LIMITS.titleMaxChars = 10 in strict mode throws a TypeError
      And TICKET_LIMITS.titleMaxChars is still 255

  Rule: normalizeSpecText removes line-ending and edge whitespace noise and keeps the words
    Lines are split on "\r\n", "\r" or "\n"; each line loses its trailing
    whitespace (String.prototype.trimEnd); the lines are joined with "\n";
    the result is trimmed at both ends (String.prototype.trim). Leading
    indentation of any line but the first, inner spaces and blank lines
    between text are kept. It never throws.

    @happy
    Scenario Outline: Normalizing spec text
      When normalizeSpecText is called with <input>
      Then it returns <output>

      Examples:
        | input                            | output             |
        | "One\nTwo"                       | "One\nTwo"         |
        | "One  \r\nTwo\t"                 | "One\nTwo"         |
        | "One\rTwo"                       | "One\nTwo"         |
        | "  a  \r\n\r\n b\t\r c  "        | "a\n\n b\n c"      |
        | "Add  export"                    | "Add  export"      |
        | "\n\nTitle\n\n"                  | "Title"            |

    @boundary
    Scenario Outline: Empty and whitespace-only text normalizes to the empty string
      When normalizeSpecText is called with <input>
      Then it returns ""

      Examples:
        | input        |
        | ""           |
        | "   "        |
        | "\r\n\t\n "  |

    @boundary
    Scenario: Normalizing is idempotent
      Given the text "  a  \r\n\r\n b\t\r c  "
      When normalizeSpecText is applied to it twice
      Then the result equals applying it once: "a\n\n b\n c"

  Rule: ticketSpecHash fingerprints title, description and issue type, version 1
    The hash is SHA-256 of the JSON array of the three normalized strings, as
    64 lowercase hex characters. It is byte-for-byte the value the Jira
    package's pricingSpecHash returns for the same three arguments. It does
    not clamp the title, does not default an empty issue type, and is
    case-sensitive in every field.

    @happy
    Scenario Outline: Known fingerprints
      When ticketSpecHash(<title>, <description>, <issueType>) is awaited
      Then it resolves to <hash>

      Examples:
        | title        | description | issueType | hash                                                             |
        | "Add export" | "Adds CSV." | "Story"   | 3b83fc961d8b052c4ebb2269255f29a3e901b27eb21f7452ea5f9ac5c5d77444 |
        | "Add export" | "Adds CSV." | "Bug"     | 7e3c32427cf03005b0304866833c254926f931bbe4beedea60c2e6297afbacc2 |
        | "Fix it"     | ""          | "Task"    | cddb635f134a4d5762ecb6231a36db6d93e45e613c8fc8c2d19837e5aaf6c16c |

    @boundary
    Scenario: An entirely empty ticket still hashes
      When ticketSpecHash("", "", "") is awaited
      Then it resolves to "799c55d702efedb7750db18b36386fc3a3f4be7dddcfb649adeb41a3ed0da228"
      And the result matches /^[0-9a-f]{64}$/

    @boundary
    Scenario: An empty issue type is not replaced by the default
      When ticketSpecHash("Fix it", "", "") and ticketSpecHash("Fix it", "", "Task") are awaited
      Then the two results differ

    @happy
    Scenario: Line-ending and trailing whitespace noise does not change the hash
      When ticketSpecHash("Title  ", "One  \r\nTwo\t", " Story ") is awaited
      Then it equals ticketSpecHash("Title", "One\nTwo", "Story")

    @happy
    Scenario Outline: A change of meaning changes the hash
      When ticketSpecHash("Add export", "Adds CSV.", "Story") is compared with ticketSpecHash(<title>, <description>, <issueType>)
      Then the two results differ

      Examples:
        | title        | description  | issueType |
        | "Add import" | "Adds CSV."  | "Story"   |
        | "Add export" | "Adds JSON." | "Story"   |
        | "Add export" | "Adds CSV."  | "Bug"     |
        | "add export" | "Adds CSV."  | "Story"   |
        | "Add  export" | "Adds CSV."  | "Story"   |

    @unhappy
    Scenario Outline: Text cannot be shifted between fields to forge a hash
      When ticketSpecHash(<a1>, <a2>, <a3>) is compared with ticketSpecHash(<b1>, <b2>, <b3>)
      Then the two results differ

      Examples:
        | a1    | a2    | a3     | b1   | b2     | b3     |
        | "AB"  | ""    | "Task" | "A"  | "B"    | "Task" |
        | "a\"b" | "c"   | "Task" | "a"  | "\"b"  | "Task" |
        | "A"   | "B"   | ""     | "A"  | ""     | "B"    |

    @happy
    Scenario: The same ticket hashes the same every time
      When ticketSpecHash("Add export", "Adds CSV.", "Story") is awaited twice
      Then both results are equal

    @concurrency
    Scenario: Overlapping hash calls do not interfere
      When these three calls are started together and awaited with Promise.all
        | title        | description | issueType |
        | "Add export" | "Adds CSV." | "Story"   |
        | "Add export" | "Adds CSV." | "Bug"     |
        | "Fix it"     | ""          | "Task"    |
      Then the results, in call order, are
        | hash                                                             |
        | 3b83fc961d8b052c4ebb2269255f29a3e901b27eb21f7452ea5f9ac5c5d77444 |
        | 7e3c32427cf03005b0304866833c254926f931bbe4beedea60c2e6297afbacc2 |
        | cddb635f134a4d5762ecb6231a36db6d93e45e613c8fc8c2d19837e5aaf6c16c |

  Rule: clampTicketTitle trims a title and cuts it to TICKET_LIMITS.titleMaxChars with an ellipsis
    The title is first trimmed (String.prototype.trim). If the trimmed title
    is at most 255 UTF-16 code units it is returned as it is, inner
    whitespace untouched. Otherwise it is cut to its first 254 code units; if
    the cut ends on a high surrogate (U+D800 to U+DBFF) that code unit is
    dropped too; trailing whitespace is removed (trimEnd); and "…" (U+2026)
    is appended. The result is never longer than 255 code units, never
    rejected and never throws; an empty or blank title returns "".

    @happy
    Scenario Outline: Titles within the limit are only trimmed
      When clampTicketTitle is called with <title>
      Then it returns <result>

      Examples:
        | title                  | result               |
        | "Add export"           | "Add export"         |
        | "  Add export \n"      | "Add export"         |
        | "Add   CSV  export"    | "Add   CSV  export"  |

    @boundary
    Scenario Outline: The length boundary
      When clampTicketTitle is called with <title>
      Then it returns <result>
      And the result has length <length>

      Examples:
        | title                               | result                       | length |
        | "x" repeated 255 times              | "x" repeated 255 times       | 255    |
        | "x" repeated 256 times              | "x" repeated 254 times + "…" | 255    |
        | "  " + "x" repeated 255 times + "  " | "x" repeated 255 times      | 255    |
        | "x" repeated 1000 times             | "x" repeated 254 times + "…" | 255    |

    @boundary
    Scenario Outline: Empty and blank titles
      When clampTicketTitle is called with <title>
      Then it returns ""

      Examples:
        | title    |
        | ""       |
        | "   "    |
        | "\n\t "  |

    @boundary
    Scenario: Whitespace before the cut is not kept before the ellipsis
      Given a title of "x" repeated 250 times, then 5 spaces, then "y" repeated 10 times (length 265)
      When clampTicketTitle is called with it
      Then it returns "x" repeated 250 times + "…"
      And the result has length 251

    @boundary
    Scenario: A cut never splits a surrogate pair
      Given a title of "a" repeated 253 times, then "😀", then "b" (length 256)
      When clampTicketTitle is called with it
      Then it returns "a" repeated 253 times + "…"
      And the result has length 254

    @boundary
    Scenario: Clamping is idempotent
      Given the title "x" repeated 300 times
      When clampTicketTitle is applied to it twice
      Then the result equals applying it once: "x" repeated 254 times + "…"

  Rule: ticketKey shows a Jira ticket by its Jira key and a native ticket by its number
    A jiraKey that is a string with non-whitespace content wins and is
    returned trimmed; the number is then not checked. Otherwise (null,
    undefined, absent, "" or whitespace only) the key is "#" followed by the
    number in base 10. A number used for the key must be a safe integer of at
    least 1; any other number throws a RangeError with the message
    "A ticket number must be a positive whole number."

    @happy
    Scenario Outline: Choosing the key
      When ticketKey is called with <ticket>
      Then it returns <key>

      Examples:
        | ticket                               | key       |
        | { number: 7, jiraKey: "ACME-12" }    | "ACME-12" |
        | { number: 7, jiraKey: " ACME-12 " }  | "ACME-12" |
        | { number: 7 }                        | "#7"      |
        | { number: 7, jiraKey: null }         | "#7"      |
        | { number: 7, jiraKey: undefined }    | "#7"      |
        | { number: 1042 }                     | "#1042"   |

    @boundary
    Scenario Outline: Blank Jira keys fall back to the number
      When ticketKey is called with { number: 3, jiraKey: <jiraKey> }
      Then it returns "#3"

      Examples:
        | jiraKey |
        | ""      |
        | "   "   |

    @boundary
    Scenario Outline: The number boundary
      When ticketKey is called with { number: <number> }
      Then it returns <key>

      Examples:
        | number                  | key                 |
        | 1                       | "#1"                |
        | 9007199254740991        | "#9007199254740991" |

    @unhappy
    Scenario Outline: A number that cannot name a native ticket is refused
      When ticketKey is called with { number: <number> }
      Then it throws a RangeError with message "A ticket number must be a positive whole number."

      Examples:
        | number            |
        | 0                 |
        | -1                |
        | 1.5               |
        | NaN               |
        | Infinity          |
        | 9007199254740992  |

    @boundary
    Scenario: A Jira key makes the number irrelevant
      When ticketKey is called with { number: 0, jiraKey: "ACME-1" }
      Then it returns "ACME-1" without throwing
```

Decided:
- `TICKET_LIMITS` shape and values: title 255, description 20 000 (the ADF cap), issue type 60, priority 60, label 255, 20 labels, component 255, 20 components. It is frozen.
- Lengths are counted in UTF-16 code units (`String.length`), the same way zod `.max` counts them.
- `clampTicketTitle` trims, cuts to 254 code units, removes trailing whitespace and adds "…", following the repo's existing `truncate` idiom. It never rejects or throws.
- `clampTicketTitle` leaves inner whitespace and line breaks alone, so titles already hashed keep their hashes.
- `clampTicketTitle` drops a high surrogate left at the cut, so an emoji is never split.
- An empty or blank title clamps to "" and is not rejected.
- `normalizeSpecText` behaves exactly like the Jira package's private `normalize`, including a final trim at both ends.
- `ticketSpecHash` matches `pricingSpecHash` byte for byte: SHA-256 of the JSON array of three normalized strings, as lowercase hex.
- `ticketSpecHash` does not clamp the title, does not swap an empty issue type for `DEFAULT_ISSUE_TYPE`, and is case-sensitive.
- `ticketSpecHash` calls are independent: overlapping calls resolve in call order to their own hashes.
- `ticketKey`: a non-blank `jiraKey` wins and is returned trimmed. Otherwise the key is `#<number>`.
- `ticketKey` checks the number only when the key falls back to it. It must be a safe integer ≥ 1, or a `RangeError` with a fixed message is thrown.
- `packages/core/src/index.ts` re-exports `./ticket.js`. No other core export changes.
