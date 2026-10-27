# filename: pick the last path segment, even when it has no extension or starts with a period

`filename` in `src/utils.ts` (published as `pathe/utils`) should return the
last segment of a path without its extension. It currently finds that segment
with `FILENAME_RE = /(^|[/\\])([^/\\]+?)(?=(\.[^.]+)?$)/`, whose "extension"
group `(\.[^.]+)` can contain path separators. So when the last segment has no
extension but an earlier directory has a period, the match lands on the
directory instead: `filename("/Users/john.doe/foo/myFile")` returns `"john"`
rather than `"myFile"`, and the same happens with Windows separators. This
change fixes how the segment is picked. Names that start with a period
(`.gitignore`, `.env.local`) must keep working the same way wherever they
appear. Under the new rules, an extension is exactly what this repository's
`extname` treats as one: a final `.` plus one or more characters that are not
`.` or a separator, with at least one character before that `.` in the same
segment. For a non-empty path that does not end in a separator,
`filename(p)` equals `parse(p).name` from the root `pathe` export.

## Interface

Exports of `src/utils.ts`. Names and signatures are unchanged.

```ts
export function filename(path: string): string | undefined;

export function normalizeAliases(
  _aliases: Record<string, string>,
): Record<string, string>;

export function resolveAlias(
  path: string,
  aliases: Record<string, string>,
): string;
```

- `filename`: behaviour changes as the rules below describe.
- `normalizeAliases` and `resolveAlias`: unchanged, along with every existing
  test of them in `test/utils.spec.ts`.
- Nothing is added to or removed from the exports of `src/utils.ts` or
  `src/index.ts`. The module-level `FILENAME_RE` constant is not exported, and
  the implementation may replace or remove it.
- Every existing `filename` case in `test/utils.spec.ts` still passes as
  written.

```gherkin
Feature: filename returns the last path segment without its extension

  Background:
    Given "filename" is imported from "src/utils"
    And "/" and "\" both count as path separators, including when mixed in one path
    And quoted strings below are literal characters: each "\" is one backslash (written "\\" in a TypeScript string literal)

  Rule: The result comes from the last path segment only; periods in earlier segments never affect it

    @happy
    Scenario Outline: A last segment without an extension is returned whole, even when a directory has a period
      When filename is called with <path>
      Then it returns <result>

      Examples:
        | path                            | result   |
        | "/Users/john.doe/foo/myFile"    | "myFile" |
        | "C:\Users\john.doe\foo\myFile"  | "myFile" |
        | "./v1.2/bin/run"                | "run"    |
        | "a.b/c.d/e"                     | "e"      |
        | "C:\dir.v2/file"                | "file"   |
        | "./.hidden/myFile"              | "myFile" |
        | "myfile"                        | "myfile" |

    @happy
    Scenario Outline: A last segment with an extension loses only that extension
      When filename is called with <path>
      Then it returns <result>

      Examples:
        | path                              | result        |
        | "test.html"                       | "test"        |
        | "/temp/myfile.html"               | "myfile"      |
        | "./myfile.html"                   | "myfile"      |
        | "C:\temp\myfile.html"             | "myfile"      |
        | "\temp\myfile.html"               | "myfile"      |
        | ".\myfile.html"                   | "myfile"      |
        | "/Users/john.doe/foo/myFile.js"   | "myFile"      |
        | "C:\Users\john.doe\foo\myFile.js" | "myFile"      |
        | "./.hidden/myFile.ts"             | "myFile"      |
        | ".\.hidden\myFile.ts"             | "myFile"      |
        | "a.b/c.d/e.f"                     | "e"           |

  Rule: Only the final extension is removed; earlier periods in the segment stay

    @happy
    Scenario Outline: Names with several periods keep everything before the last one
      When filename is called with <path>
      Then it returns <result>

      Examples:
        | path                     | result        |
        | "./foo.bar.baz.js"       | "foo.bar.baz" |
        | ".\foo.bar.baz.js"       | "foo.bar.baz" |
        | "/src/app.config.ts"     | "app.config"  |
        | "archive.tar.gz"         | "archive.tar" |

  Rule: A leading period is part of the name, never the start of an extension

    @boundary
    Scenario Outline: A dotfile with no further period is returned whole
      When filename is called with <path>
      Then it returns <result>

      Examples:
        | path                          | result       |
        | ".gitignore"                  | ".gitignore" |
        | "/temp/.gitignore"            | ".gitignore" |
        | "foo\.gitignore"              | ".gitignore" |
        | "/Users/john.doe/.config"     | ".config"    |
        | "C:\Users\john.doe\.npmrc"    | ".npmrc"     |
        | "./.hidden"                   | ".hidden"    |

    @boundary
    Scenario Outline: A dotfile with a further period loses only the final extension
      When filename is called with <path>
      Then it returns <result>

      Examples:
        | path                 | result  |
        | "/temp/.env.local"   | ".env"  |
        | ".a.b"               | ".a"    |
        | "./.eslintrc.json"   | ".eslintrc" |

  Rule: A period counts as an extension separator only when non-period characters follow it and something precedes it, as in this repository's extname

    @boundary
    Scenario Outline: Segments made of or ending in periods follow the extname rule
      When filename is called with <path>
      Then it returns <result>

      Examples:
        | path        | result  |
        | "foo."      | "foo."  |
        | "/a/foo."   | "foo."  |
        | "."         | "."     |
        | ".."        | ".."    |
        | "..."       | "..."   |
        | "foo/.."    | ".."    |
        | "..foo"     | "."     |
        | "a..b"      | "a."    |

    @boundary
    Scenario Outline: For a non-empty path that does not end in a separator, filename equals parse(path).name
      Given "parse" is imported from "src/index"
      When filename is called with <path>
      Then it returns the same string as parse(<path>).name

      Examples:
        | path                           |
        | "/Users/john.doe/foo/myFile"   |
        | "/temp/.env.local"             |
        | "./foo.bar.baz.js"             |
        | "..foo"                        |
        | "a..b"                         |
        | "foo."                         |

  Rule: When there is no last segment, the result is undefined

    @unhappy
    Scenario Outline: An empty path or a path ending in a separator gives undefined
      When filename is called with <path>
      Then it returns undefined

      Examples:
        | path            |
        | ""              |
        | "/"             |
        | "\"             |
        | "./"            |
        | "C:\temp\"      |
        | "C:\"           |
        | "/foo/bar/"     |
        | "/foo/bar//"    |
        | "foo.d/"        |

  Rule: The last segment is returned as written: no trimming, no case change, no drive-letter handling, and filename never throws for a string

    @boundary
    Scenario Outline: Characters other than separators and the extension are kept exactly
      When filename is called with <path>
      Then it returns <result>

      Examples:
        | path                   | result        |
        | " "                    | " "           |
        | "/tmp/ my file .txt"   | " my file "   |
        | "/tmp/MyFile.TXT"      | "MyFile"      |
        | "c:\temp\Report.pdf"   | "Report"      |
        | "C:"                   | "C:"          |
        | "/tmp/résumé.doc"      | "résumé"      |

  Rule: filename keeps no state between calls

    @boundary
    Scenario: Repeated and interleaved calls return the same results
      When filename is called with "/Users/john.doe/foo/myFile" twice
      And then with "/temp/.env.local"
      And then with "/Users/john.doe/foo/myFile" again
      Then the results are "myFile", "myFile", ".env" and "myFile"
```

## Decided:

- **How the last segment is chosen:** it is everything after the final `/` or `\`, and periods in earlier segments are ignored.
  - Ticket: "fix(utils/filename): handle files beginning with a period or without ext (#185)"
  - Instead: normalise the path first with `normalizeWindowsPath` and split on `/` only. The result would be the same, but that ties the behaviour to the normaliser.
- **Which periods start an extension:** follow this repository's `extname`. A final `.` followed by one or more non-period characters, with at least one character before it in the segment, starts an extension. So `"foo."`→`"foo."`, `".."`→`".."`, `"..."`→`"..."`, `"..foo"`→`"."`.
  - Ticket: silent.
  - Instead: follow Node's `path.parse().name` (`"foo."`→`"foo"`, `"..."`→`".."`), or the simpler "strip from the last period at index > 0" (`".."`→`"."`).
- **Dotfiles:** a leading period is part of the name. `".gitignore"`→`".gitignore"`, and `".env.local"`→`".env"` (only the last extension is removed).
  - Ticket: "handle files beginning with a period"
  - Instead: treat a dotfile's whole name as the stem (`".env.local"`→`".env.local"`), or return `undefined` or `""` for a bare dotfile.
- **Several periods:** only the final extension is removed (`"foo.bar.baz.js"`→`"foo.bar.baz"`).
  - Ticket: silent.
  - Instead: strip everything from the first period (`"foo"`).
- **Trailing separators:** the result is `undefined`, as the existing `"C:\\temp\\"` test requires, including for repeated separators.
  - Ticket: silent.
  - Instead: skip trailing separators the way `basename` does (`"/foo/bar/"`→`"bar"`).
- **Empty input and root-only paths:** `""`, `"/"`, `"\\"`, `"./"` and `"C:\\"` give `undefined`.
  - Ticket: silent.
  - Instead: return `""`, as `basename("")` does.
- **Rejected inputs:** no string is rejected. `filename` never throws and signals "no name" only with `undefined`. Non-string arguments fall outside the `path: string` signature and are not specified.
  - Ticket: silent.
  - Instead: throw a `TypeError` for empty or non-string input, as Node's `path` functions do.
- **No normalisation of the result:** whitespace is not trimmed, case is kept, `.`/`..` segments are not resolved (`"foo/.."`→`".."`), and drive letters get no special handling (`"C:"`→`"C:"`).
  - Ticket: silent.
  - Instead: resolve the path with `normalize` first (`"foo/.."`→`"."`), or treat a bare drive such as `"C:"` as having no filename.
- **Return type and other exports:** `filename` stays `(path: string) => string | undefined`, and `normalizeAliases` and `resolveAlias` are unchanged.
  - Ticket: "The change keeps the exports' names and signatures."
  - Instead: change the return type to always be `string`, using `""` for no name.
- **Statelessness and overlapping calls:** `filename` is synchronous and keeps no state between calls, for example no global-flag regex `lastIndex`. Calls cannot overlap, so there are no `@concurrency` scenarios.
  - Ticket: silent.
  - Instead: cache results per path.
