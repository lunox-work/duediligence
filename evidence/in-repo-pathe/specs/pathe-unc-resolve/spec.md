# `resolve()` keeps the UNC prefix

`resolve` in `src/_path.ts` drops one of the two leading separators of a UNC
path. Today `resolve("//server/share/file")` returns `"/server/share/file"`,
while `normalize` and `join` already return `"//server/share/file"` for the same
input. This change makes `resolve` keep the `//` prefix whenever the absolute
path it resolves against starts with two separators. It uses the same rule
`normalize` already applies, so the two functions agree.

Exports of `src/_path.ts` (re-exported from `src/index.ts` and through
`posix`/`win32`). Names and signatures stay as they are:

- `resolve: typeof path.resolve`, i.e. `(...paths: string[]) => string`. This is
  the only function whose behaviour changes.
- `format: typeof path.format`. Its output changes only through `resolve`, when
  `root` is set and the resolved path is UNC (see the rule below).
- `relative: typeof path.relative`, i.e. `(from: string, to: string) => string`.
  Its outputs stay exactly as they are today for every input, UNC inputs
  included.
- `sep`, `normalize`, `join`, `normalizeString`, `isAbsolute`,
  `toNamespacedPath`, `extname`, `dirname`, `basename`, `parse` and
  `matchesGlob` keep their current behaviour.
- No new exports. The module-private `_UNC_REGEX` (`/^[/\\]{2}/`) is the test for
  "starts with two separators" used below.

Terms used below:

- **Anchor**: the argument that stops `resolve`'s right-to-left scan. This is
  the rightmost non-empty argument for which `isAbsolute` is true, after
  `normalizeWindowsPath`. If no argument is absolute, the anchor is the value of
  `process.cwd()` with backslashes turned into `/`. If no argument is absolute
  and the cwd is empty or missing, there is no anchor.
- **UNC anchor**: an anchor that starts with two separators (`/` or `\` in any
  mix). Because the anchor is absolute, the third character is never `.`.
  `isAbsolute` treats `//.` as relative.
- **Body**: `normalizeString(<anchor and the arguments after it joined by "/">, false)`.
  This is what `resolve` computes today before it adds the leading `/`.

```gherkin
Feature: resolve preserves the UNC prefix
  Background:
    Given "resolve", "relative" and "format" are imported from "src/_path.ts"
    And arguments that are undefined, null or "" are skipped, as today
    And in this file the double-quoted strings in gherkin are JavaScript string literals, so "\\\\server\\share" is the 14-character value \\server\share

  Rule: When the anchor is a UNC anchor, resolve returns "//" followed by the body, with no trailing separator

    @happy
    Scenario Outline: A single UNC argument keeps both leading separators
      When resolve is called with <input>
      Then it returns <output>

      Examples:
        | input                                 | output                  |
        | "//server/share/file"                 | "//server/share/file"   |
        | "\\\\server\\share\\file"             | "//server/share/file"   |
        | "\\\\server/share/file"               | "//server/share/file"   |
        | "/\\server\\share\\file"              | "//server/share/file"   |
        | "//server/share/x/./y/../z"           | "//server/share/x/z"    |
        | "//server//share//x//"                | "//server/share/x"      |
        | "//server/share/"                     | "//server/share"        |
        | "//server/share"                      | "//server/share"        |
        | "//server"                            | "//server"              |
        | "//server/"                           | "//server"              |
        | "//?/C:/foo"                          | "//?/C:/foo"            |
        | "\\\\?\\C:\\foo"                      | "//?/C:/foo"            |
        | "//C:/foo/bar"                        | "//C:/foo/bar"          |

    @happy
    Scenario Outline: Relative arguments after a UNC anchor resolve beneath it
      When resolve is called with the arguments <args>
      Then it returns <output>

      Examples:
        | args                                             | output                       |
        | "//server/share/file", "../path"                 | "//server/share/path"        |
        | "\\\\server\\share\\file", "..\\path"            | "//server/share/path"        |
        | "//server/share", "dir", "./file.txt"            | "//server/share/dir/file.txt"|
        | "//server/share", undefined, null, "", "a"       | "//server/share/a"           |
        | "//server/share/a", "b/", "c\\"                  | "//server/share/a/b/c"       |

    @happy
    Scenario Outline: A UNC argument after a non-UNC absolute argument becomes the anchor
      When resolve is called with the arguments <args>
      Then it returns <output>

      Examples:
        | args                                   | output               |
        | "/foo", "//server/share", "x"          | "//server/share/x"   |
        | "C:/foo", "//server/share/x"           | "//server/share/x"   |
        | "C:\\foo", "\\\\server\\share\\x"      | "//server/share/x"   |
        | "//old/share", "//server/share/x"      | "//server/share/x"   |

    @happy
    Scenario: A UNC working directory is the anchor when no argument is absolute
      Given process.cwd is replaced, as the existing tests do, by a function returning "\\\\server\\share\\project"
      When resolve is called with the arguments "src", "index.ts"
      Then it returns "//server/share/project/src/index.ts"
      And resolve called with no arguments returns "//server/share/project"

  Rule: ".." segments may climb past the share; the prefix stays only while the body is non-empty, matching normalize

    @boundary
    Scenario Outline: Climbing out of the share
      When resolve is called with the arguments <args>
      Then it returns <output>
      And normalize of the same arguments joined with "/" returns the same value

      Examples:
        | args                                       | output        |
        | "//server/share/.."                        | "//server"    |
        | "//server/../share"                        | "//share"     |
        | "//server/share", "a", "..", "..", "b"     | "//server/b"  |
        | "//server/share", "..", ".."               | "/"           |
        | "//server/share/a", "../../.."             | "/"           |
        | "//server/share", "..", "..", ".."         | "/"           |

    @boundary
    Scenario Outline: Separators only, or three or more leading separators
      When resolve is called with <input>
      Then it returns <output>

      Examples:
        | input      | output   |
        | "//"       | "/"      |
        | "\\\\"     | "/"      |
        | "///"      | "/"      |
        | "///foo"   | "//foo"  |
        | "\\\\\\foo"| "//foo"  |

  Rule: An anchor that is not UNC resolves exactly as before

    @happy
    Scenario Outline: Non-UNC anchors keep the single leading separator or drive letter
      When resolve is called with the arguments <args>
      Then it returns <output>

      Examples:
        | args                                   | output              |
        | "/foo/bar", "./baz"                    | "/foo/bar/baz"      |
        | "\\foo\\bar", "..", ".", ".\\baz"      | "/foo/baz"          |
        | "C:\\foo\\bar", ".\\baz"               | "C:/foo/bar/baz"    |
        | "//server/share", "/foo"               | "/foo"              |
        | "//server/share", "C:/foo"             | "C:/foo"            |
        | "//server/share", "\\foo"              | "/foo"              |
        | "/foo", "bar//baz"                     | "/foo/bar/baz"      |

    @unhappy
    Scenario: A "//." device path is not absolute, so it resolves against the working directory as today
      Given process.cwd is replaced by a function returning "C:\\Windows\\path\\only"
      When resolve is called with "//./foo/bar"
      Then it returns "C:/Windows/path/only/foo/bar"
      And resolve called with "\\\\.\\c:\\temp" returns "C:/Windows/path/only/c:/temp"

    @unhappy
    Scenario: Without a working directory, a relative result never gains a UNC prefix
      Given process.cwd is replaced by a function returning ""
      When resolve is called with "//./x"
      Then it returns "x"
      And resolve called with ".", "./" returns "."
      And resolve called with "..", ".." returns "../.."

  Rule: resolve keeps no state between calls

    @boundary
    Scenario: A UNC call does not affect the next call
      When resolve is called with "//server/share/a"
      And resolve is then called with "/foo/bar"
      And resolve is then called with "//server/share/b"
      Then the three results are "//server/share/a", "/foo/bar" and "//server/share/b"

  Rule: format with a root returns what resolve returns, so it keeps the UNC prefix too

    @happy
    Scenario Outline: format over UNC segments
      When format is called with <object>
      Then it returns <output>

      Examples:
        | object                                                       | output                       |
        | { root: "//server/share/", base: "x.txt" }                   | "//server/share/x.txt"       |
        | { root: "/", dir: "//server/share/dir", base: "x.txt" }      | "//server/share/dir/x.txt"   |
        | { dir: "\\\\server\\share\\dir", base: "x.txt" }             | "//server/share/dir/x.txt"   |
        | { root: "/", base: "file.txt", ext: "ignored" }              | "/file.txt"                  |

  Rule: relative returns exactly what it returned before this change, including for UNC inputs

    @boundary
    Scenario Outline: relative between UNC and non-UNC paths
      When relative is called with <from> and <to>
      Then it returns <output>

      Examples:
        | from                          | to                            | output                     |
        | "//server/share/a"            | "//server/share/b"            | "../b"                     |
        | "//server/share/a"            | "//other/share/b"             | "../../../other/share/b"   |
        | "/a"                          | "//server/share/b"            | "../server/share/b"        |
        | "//server/share/a"            | "/b"                          | "../../../b"               |
        | "\\\\server\\share\\a\\b"     | "\\\\server\\share\\a"        | ".."                       |
        | "//server/share"              | "//server/share"              | ""                         |
        | "//server/share/a"            | "//server/share/a/b/c"        | "b/c"                      |
```

Notes for the implementer:

- Every `resolve` case above must hold both with the real `process.cwd` and with
  `process.cwd` mocked to `"C:\\Windows\\path\\only"`, because the repository's
  `runTest` helper checks both. Cases with an absolute argument do not depend on
  the cwd.
- The existing `resolve`, `relative` and `format` cases in `test/index.spec.ts`
  must still pass unchanged.

Decided:

- What counts as a UNC anchor: any absolute anchor that starts with two separators (`_UNC_REGEX`, the same test `normalize` uses), in any mix of `/` and `\`.
  - Ticket: "fix(resolve): preserve UNC prefix (#245) (#246)"
  - Instead: Node `win32` rule, where a UNC root needs exactly two separators followed by a server name and a share name.
- How the prefix is written: always as `//` plus the body, with backslashes converted like the rest of the output.
  - Ticket: "fix(resolve): preserve UNC prefix (#245) (#246)"
  - Instead: keep the input's original separators (`\\server\share`) as Node `win32` does.
- Three or more leading separators (`"///foo"`): result is `"//foo"`, matching `normalize`.
  - Ticket: silent.
  - Instead: collapse to a single `/` (`"/foo"`), as `path.posix.resolve` does.
- Climbing above the share with `..`: no clamping at `//server/share`. Segments are removed like any others, and once the body is empty the result is `"/"`, matching `normalize`.
  - Ticket: silent.
  - Instead: clamp at the share root (`"//server/share"`) as Node `win32` does.
- Trailing separator: stripped, including for a bare share (`"//server/share/"` gives `"//server/share"`), as `resolve` already does for other paths.
  - Ticket: silent.
  - Instead: keep a trailing separator on a share root (`"\\\\server\\share\\"`) as Node `win32` does.
- Which argument decides UNC-ness: only the anchor. A later root-relative (`"/foo"`) or drive (`"C:/foo"`) argument replaces a UNC anchor completely.
  - Ticket: silent.
  - Instead: Node `win32`, where a later `"/foo"` stays on the earlier UNC share (`\\server\share\foo`).
- UNC working directory: a UNC `process.cwd()` that serves as the anchor keeps its prefix.
  - Ticket: silent.
  - Instead: apply the fix only to explicit arguments.
- `//.` device paths: still not absolute (`isAbsolute` unchanged), so they resolve against the cwd as before.
  - Ticket: silent.
  - Instead: treat `//./` as an absolute device root and return `"//./foo/bar"`, as `normalize` and Node `win32` do.
- Relative results when the cwd is unavailable: never get a UNC prefix (`resolve("//./x")` gives `"x"`).
  - Ticket: silent.
  - Instead: return `"//./x"`, as `normalize` does for a non-absolute UNC-looking input.
- Effect on `format`: it follows `resolve`, so a UNC root or dir with `root` set now keeps `//`.
  - Ticket: "The change keeps the exports' names and signatures."
  - Instead: keep `format`'s old single-slash output.
- Effect on `relative`: outputs stay as they are today for UNC inputs (for example `relative("/a", "//server/share/b")` stays `"../server/share/b"` and does not become `"..//server/share/b"`).
  - Ticket: "The change keeps the exports' names and signatures."
  - Instead: let `relative` take on the new `resolve` output and produce empty segments, or return `to` as-is when the roots differ, as Node `win32` does.
- Overlapping calls: `resolve` is synchronous and keeps no state between calls, so a UNC result never leaks into a later call.
  - Ticket: silent.
  - Instead: no alternative needed. A pure function has nothing to order.
