# Sandbox status enum

Sandbox status is stored as free text ("draft", "Draft", "in-review", ...), so
filters miss tasks. The status module in `src/index.ts` introduces the
`SandboxStatus` enum (`"draft"`, `"review"`, `"published"`, `"claimed"`,
`"merged"`). `writeStatus` guarantees that only enum values are written;
`readStatus` and `readStatuses` normalise values already stored when they are
read. All three functions are synchronous, keep no state between calls and
never mutate their arguments.

Notation used below: string values are shown in double quotes; inside them
`\t`, `\n`, `\"` and `\uXXXX` stand for a tab, a line feed, a literal double
quote and the UTF-16 code unit with hex value XXXX, as in a JavaScript string
literal. Non-string values (`undefined`, `null`, numbers, objects) are written
as JavaScript literals without quotes. Because Gherkin trims table cells, every string cell in a table is
written in double quotes and the string is exactly what lies between them.
"Whitespace" means exactly the characters JavaScript's
`String.prototype.trim` removes (the same set as the regex class `\s`).

```gherkin
Feature: Sandbox status enum
  Statuses are written only as one of the five enum values, and values that
  are already stored are normalised to a status (or to null) when read.

  Background:
    Given the SandboxStatus values are "draft", "review", "published", "claimed" and "merged"

  Rule: writeStatus returns a status exactly as given

    @happy
    Scenario Outline: Each status is written as itself
      When writeStatus is called with <value>
      Then it returns <value>

      Examples:
        | value       |
        | "draft"     |
        | "review"    |
        | "published" |
        | "claimed"   |
        | "merged"    |

  Rule: writeStatus throws a RangeError for any string that is not exactly a status
    No cleaning is applied when writing: case, surrounding whitespace,
    separators and old spellings are all rejected. The error is a RangeError
    whose message is `Invalid sandbox status: "` + the value exactly as given +
    `"` (the value is inserted verbatim, not escaped). Nothing is returned.

    @unhappy
    Scenario Outline: Non-status strings are rejected with the value named as given
      When writeStatus is called with <value>
      Then it throws a RangeError
      And the error message is 'Invalid sandbox status: <value>'

      Examples:
        | value       |
        | "Draft"     |
        | "REVIEW"    |
        | " draft"    |
        | "draft "    |
        | "merged\n"  |
        | "in-review" |
        | "in review" |
        | "in_review" |
        | "approved"  |
        | "publish"   |

    @unhappy
    Scenario: An old spelling is rejected even though readStatus accepts it
      Given readStatus("in-review") returns "review"
      When writeStatus is called with "in-review"
      Then it throws a RangeError with message 'Invalid sandbox status: "in-review"'

    @boundary
    Scenario: The empty string is rejected
      When writeStatus is called with ""
      Then it throws a RangeError with message 'Invalid sandbox status: ""'

  Rule: writeStatus throws a TypeError for a value that is not a string
    The message is "Sandbox status must be a string".

    @unhappy
    Scenario Outline: Non-string values are rejected
      When writeStatus is called with <value>
      Then it throws a TypeError with message "Sandbox status must be a string"

      Examples:
        | value     |
        | undefined |
        | null      |
        | 1         |
        | {}        |

  Rule: readStatus cleans the stored value before matching it
    Cleaning happens in this order: (1) leading and trailing whitespace is
    removed, (2) the value is lowercased with `toLowerCase()` (locale
    independent), (3) every maximal run of characters that are whitespace,
    "-" or "_" (in any mix) becomes a single space " ". The cleaned value is
    then compared exactly against the five statuses and the old spellings.
    No Unicode normalisation is applied.

    @happy
    Scenario Outline: Statuses in any case and surrounding whitespace read as the status
      When readStatus is called with <stored>
      Then it returns <status>

      Examples:
        | stored            | status      |
        | "draft"           | "draft"     |
        | "Draft"           | "draft"     |
        | "DRAFT"           | "draft"     |
        | "Review"          | "review"    |
        | "  published"     | "published" |
        | "claimed\n"       | "claimed"   |
        | "\tMerged \t"     | "merged"    |
        | "\u00A0draft"     | "draft"     |

    @boundary
    Scenario Outline: Separators at the ends are not trimmed, so the value is no status
      Only whitespace is trimmed from the ends. A leading or trailing "-" or
      "_" survives as a space after step 3 and the value matches nothing.
      When readStatus is called with <stored>
      Then it returns null

      Examples:
        | stored     |
        | "draft-"   |
        | "_draft"   |
        | "-merged-" |
        | "draft -"  |

    @boundary
    Scenario Outline: Characters that are not whitespace are never removed
      When readStatus is called with <stored>
      Then it returns null

      Examples:
        | stored                          |
        | "draft\u200B"                   |
        | "draft."                        |
        | "\"draft\""                     |
        | "dr aft"                        |
        | "\uFF44\uFF52\uFF41\uFF46\uFF54" |

  Rule: readStatus reads the known old spellings as their status
    The old spellings form a closed list, matched against the cleaned value:
    "in review" reads as "review". No other old spelling exists; anything else
    that is not a status after cleaning reads as null.

    @happy
    Scenario Outline: Variants of "in review" read as review
      When readStatus is called with <stored>
      Then it returns "review"

      Examples:
        | stored            |
        | "in-review"       |
        | "In-Review"       |
        | "in_review"       |
        | "IN__REVIEW"      |
        | "in review"       |
        | "in   review"     |
        | "in\treview"      |
        | "in - _review"    |
        | "  In-Review\n"   |

    @unhappy
    Scenario Outline: Spellings outside the list read as null
      When readStatus is called with <stored>
      Then it returns null

      Examples:
        | stored         |
        | "inreview"     |
        | "InReview"     |
        | "under review" |
        | "reviewing"    |
        | "reviewed"     |
        | "re-view"      |
        | "in-draft"     |

  Rule: readStatus reads a value that is no status as null, never as the nearest one
    readStatus never throws for a string argument; it returns null instead.
    There is no length limit.

    @unhappy
    Scenario Outline: Unknown, misspelled and partial values read as null
      When readStatus is called with <stored>
      Then it returns null

      Examples:
        | stored         |
        | "drafts"       |
        | "drat"         |
        | "publish"      |
        | "merge"        |
        | "claim"        |
        | "archived"     |
        | "draft review" |

    @boundary
    Scenario Outline: Empty, whitespace-only and separator-only values read as null
      When readStatus is called with <stored>
      Then it returns null

      Examples:
        | stored   |
        | ""       |
        | "   "    |
        | "\t\n"   |
        | "-"      |
        | "___"    |

    @boundary
    Scenario: A very long value reads as null without throwing
      When readStatus is called with "x" repeated 100000 times
      Then it returns null

  Rule: readStatus throws a TypeError for a value that is not a string
    The message is "Sandbox status must be a string".

    @unhappy
    Scenario Outline: Non-string values are rejected
      When readStatus is called with <value>
      Then it throws a TypeError with message "Sandbox status must be a string"

      Examples:
        | value     |
        | undefined |
        | null      |
        | 0         |
        | ["draft"] |

  Rule: readStatuses reads every row in input order
    The result has a `rows` array with one new object per input row, at the
    same position, holding exactly two properties: `id` (copied unchanged; not
    validated, duplicates kept) and `status` (what readStatus returns for the
    row's `status`). Other properties of input rows are not copied. The input
    array and its rows are not modified.

    @happy
    Scenario: Mixed rows are read in order
      When readStatuses is called with the rows
        | id   | status      |
        | "t3" | "Draft"     |
        | "t1" | "in-review" |
        | "t2" | "merged"    |
        | "t4" | "archived"  |
      Then the result rows are
        | id   | status   |
        | "t3" | "draft"  |
        | "t1" | "review" |
        | "t2" | "merged" |
        | "t4" | null     |

    @boundary
    Scenario: No rows gives an empty result
      When readStatuses is called with []
      Then the result is { rows: [], unreadable: [] }

    @boundary
    Scenario: Duplicate ids are kept as separate rows
      When readStatuses is called with the rows
        | id  | status      |
        | "a" | "draft"     |
        | "a" | "PUBLISHED" |
      Then the result rows are
        | id  | status      |
        | "a" | "draft"     |
        | "a" | "published" |

    @boundary
    Scenario: Input is not modified and extra properties are not copied
      Given the input row { id: "a", status: " Draft ", owner: "kim" }
      When readStatuses is called with that row in an array
      Then the result rows are [{ id: "a", status: "draft" }]
      And the input row is still { id: "a", status: " Draft ", owner: "kim" }
      And the input array still has length 1

  Rule: readStatuses lists each unreadable original value once, sorted, exactly as stored
    `unreadable` holds every distinct original `status` string whose row read
    as null. Values are kept exactly as stored (not cleaned), so values that
    differ in any character, including case or whitespace, are listed
    separately. Duplicates by exact string equality appear once. The list is
    sorted by UTF-16 code unit order (the default `Array.prototype.sort`
    order, not locale order). Values that read as a status are never listed.

    @happy
    Scenario: Unreadable values are deduplicated and sorted by code unit
      When readStatuses is called with the rows
        | id  | status      |
        | "1" | "foo"       |
        | "2" | "Foo"       |
        | "3" | "draft"     |
        | "4" | "foo"       |
        | "5" | "bar"       |
        | "6" | "Foo"       |
        | "7" | "in-review" |
      Then the result unreadable is ["Foo", "bar", "foo"]

    @boundary
    Scenario: Unreadable values keep their original whitespace
      When readStatuses is called with the rows
        | id  | status   |
        | "1" | "draft-" |
        | "2" | " bogus" |
        | "3" | "bogus"  |
        | "4" | ""       |
        | "5" | " bogus" |
      Then the result unreadable is ["", " bogus", "bogus", "draft-"]

    @happy
    Scenario: All rows readable gives no unreadable values
      When readStatuses is called with the rows
        | id  | status    |
        | "1" | "Draft"   |
        | "2" | "draft"   |
        | "3" | "CLAIMED" |
      Then the result unreadable is []

  Rule: readStatuses rejects input that is not an array of rows with string statuses
    If `rows` is not an array, it throws a TypeError with message
    "Rows must be an array". If any element is not an object whose `status`
    is a string, it throws a TypeError with message
    "Sandbox status must be a string". No partial result is returned.

    @unhappy
    Scenario Outline: A non-array argument is rejected
      When readStatuses is called with <rows>
      Then it throws a TypeError with message "Rows must be an array"

      Examples:
        | rows                       |
        | undefined                  |
        | null                       |
        | { id: "a", status: "x" }   |
        | "draft"                    |

    @unhappy
    Scenario Outline: A row without a string status is rejected
      When readStatuses is called with [{ id: "a", status: "draft" }, <row>]
      Then it throws a TypeError with message "Sandbox status must be a string"

      Examples:
        | row                      |
        | { id: "b", status: null } |
        | { id: "b" }              |
        | { id: "b", status: 3 }   |
        | null                     |

  Rule: Calls are independent
    The functions are synchronous and keep no state or cache, so calls cannot
    overlap and one call never affects another. Each readStatuses call returns
    new arrays and new row objects.

    @concurrency
    Scenario: Results of separate calls do not share state
      Given rows [{ id: "a", status: "nope" }]
      When readStatuses is called with those rows twice
      And the first result's unreadable array is cleared and its first row's status set to "draft"
      Then the second result is { rows: [{ id: "a", status: null }], unreadable: ["nope"] }
      And a third call with the same rows gives the same result as the second

    @concurrency
    Scenario: Interleaved reads and writes do not affect each other
      When writeStatus("Draft") is called and throws
      And readStatus("Draft") is called
      Then readStatus returns "draft"
      And writeStatus("draft") then returns "draft"
```

Decided:
- Write strictness: `writeStatus` accepts only the five exact lowercase statuses, with no trimming or case folding.
- Write error type and message: `RangeError` with message `Invalid sandbox status: "<value as given, verbatim>"`.
- Old spellings on write: rejected like any other non-status, even though `readStatus` accepts them.
- Non-string arguments: every function throws `TypeError` with "Sandbox status must be a string" (or "Rows must be an array" for a non-array `rows`).
- Whitespace definition: the characters `String.prototype.trim` / `\s` match, including tab, newline and U+00A0.
- Cleaning order: trim whitespace first, then lowercase, then collapse mixed runs of whitespace/"-"/"_" to one space.
- Leading/trailing "-" or "_": not trimmed, so the value reads as null.
- Lowercasing: locale-independent `toLowerCase()`, with no Unicode normalisation (full-width letters, zero-width characters do not match).
- Old spellings list: closed, only "in review" (after cleaning), which reads as "review"; "inreview", "under review" and similar read as null.
- Empty, whitespace-only and separator-only values: read as null.
- Length limit: none; long values read as null without throwing.
- `readStatuses` row output: same order and length, new objects with only `id` and `status`, ids copied unchanged and duplicates kept, input not mutated.
- `unreadable` dedup: by exact original string, so values that differ in case or whitespace are listed separately.
- `unreadable` sorting: UTF-16 code unit order (default `sort()`), not locale order.
- Invalid row in `readStatuses`: the whole call throws, with no partial result.
- Overlapping calls: functions are synchronous and stateless, and results never share arrays or objects between calls.
