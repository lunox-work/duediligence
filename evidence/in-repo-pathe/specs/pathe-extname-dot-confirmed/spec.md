# extname returns "." for paths ending with a dot

`extname` in `src/_path.ts` finds the extension with the regular expression
`_EXTNAME_RE = /.(\.[^./]+)$/`. That expression needs at least one non-dot
character after the last dot, so a path whose last segment ends with a dot
(`"index."`, `"file.txt."`, `"..."`) currently gives `""`. Node's
`path.extname` gives `"."` for these. This change makes `extname` return
`"."` when the path ends with a dot. The inputs `"."` and `".."` on their
own still give `""`. `parse` reads its
`ext` and `name` from `extname`, so it changes with it. All other behaviour
stays the same, including how trailing separators are handled.

## Interface

No exports are added, removed or renamed, and no signatures change.

- `extname: typeof path.extname`, so `(p: string) => string`. This is the
  only function whose own logic changes.
- `parse: typeof path.parse`, so `(p: string) => path.ParsedPath`. Its code
  stays the same, but its `ext` and `name` fields follow the new `extname`
  results, because it already computes
  `ext = extname(base)` and `name = base.slice(0, base.length - ext.length)`.
- `posix.extname`, `win32.extname`, `posix.parse` and `win32.parse` (from
  `src/index.ts`) delegate to the same functions and behave identically.
- `_EXTNAME_RE` is a private constant. It can be changed or replaced freely,
  as long as the rules below hold.
- All other exports keep their current behaviour: `sep`, `normalize`,
  `join`, `resolve`, `normalizeString`, `isAbsolute`, `toNamespacedPath`,
  `relative`, `dirname`, `format`, `basename`, `matchesGlob` and `delimiter`.

## Definition used below

`extname(p)` works on `q = normalizeWindowsPath(p)`, so every `\` becomes
`/`. `extname(p)` is decided in this order:

1. If the input `p` is exactly `"."` or `".."`, or `q` is empty or ends with
   `/`, the result is `""`.
2. Otherwise, if `q` ends with `.`, the result is `"."`. This includes paths
   whose last segment is `"."` or `".."` after a separator, such as `"/."`
   and `"a/.."`.
3. Otherwise the current behaviour applies unchanged. The result is the last
   `.` in `q` followed by the characters after it, provided that dot is not
   the first character of `q` and at least one character follows it, none
   of them `.` or `/`. If not, the result is `""`.

```gherkin
Feature: extname handles inputs ending with a dot

  Background:
    Given "extname" and "parse" are imported from "src/_path.ts"

  Rule: When the last segment ends with a dot, the result is "."

    @happy
    Scenario Outline: A name ending with a dot has the extension "."
      When extname is called with "<path>"
      Then it returns "."

      Examples:
        | path                 |
        | index.               |
        | x.                   |
        | ./x.                 |
        | file.txt.            |
        | a.b.c.               |
        | a/b/index.           |
        | /temp/myfile.        |
        | a.b/c.               |

    @happy
    Scenario Outline: Windows separators are normalised before the trailing dot is found
      When extname is called with "<path>"
      Then it returns "."

      Examples:
        | path                 |
        | C:\temp\myfile.      |
        | \temp\myfile.        |
        | .\myfile.            |

    @boundary
    Scenario Outline: Repeated trailing dots still give a single "."
      When extname is called with "<path>"
      Then it returns "."

      Examples:
        | path    |
        | foo..   |
        | foo...  |
        | ..foo.  |

    @boundary
    Scenario Outline: A dotfile name ending with a dot has the extension "."
      When extname is called with "<path>"
      Then it returns "."

      Examples:
        | path      |
        | .index.   |
        | .index..  |

    @boundary
    Scenario: A drive-relative name ending with a dot is treated as an ordinary segment
      When extname is called with "C:."
      Then it returns "."

  Rule: Only the whole inputs "." and ".." have no extension; any other path of dots ending with a dot gives "."

    @boundary
    Scenario Outline: Paths whose last segment is made only of dots
      When extname is called with "<path>"
      Then it returns "<ext>"

      Examples:
        | path   | ext |
        | .      |     |
        | ..     |     |
        | ...    | .   |
        | ....   | .   |
        | /.     | .   |
        | /..    | .   |
        | a/.    | .   |
        | a/..   | .   |
        | ./..   | .   |
        | C:\..  | .   |
        | /...   | .   |

  Rule: A path ending with a separator still has no extension

    @unhappy
    Scenario Outline: A trailing "/" or "\" gives "" even when the name before it ends with a dot
      When extname is called with "<path>"
      Then it returns ""

      Examples:
        | path       |
        | ./         |
        | ../        |
        | ..\        |
        | index./    |
        | index.//   |
        | foo.\      |
        | index.js/  |
        | a.b/       |

    @unhappy
    Scenario: An empty path has no extension
      When extname is called with ""
      Then it returns ""

  Rule: Paths that do not end with a dot keep their current extension

    @happy
    Scenario Outline: Existing results are unchanged
      When extname is called with "<path>"
      Then it returns "<ext>"

      Examples:
        | path                  | ext   |
        | /temp/myfile.html     | .html |
        | ./myfile.html         | .html |
        | ./myfile.tar.gz       | .gz   |
        | ./myfile.tar.gz.br    | .br   |
        | .foo                  |       |
        | ..foo                 | .foo  |
        | foo.123               | .123  |
        | ./dir/file            |       |
        | C:\temp\myfile.html   | .html |
        | \temp\myfile.html     | .html |
        | .\myfile.html         | .html |

  Rule: parse takes ext from extname and name from the rest of base

    @happy
    Scenario Outline: parse on a path ending with a dot
      When parse is called with "<path>"
      Then it returns root "<root>", dir "<dir>", base "<base>", ext "<ext>" and name "<name>"

      Examples:
        | path                   | root | dir        | base       | ext | name     |
        | index.                 |      | .          | index.     | .   | index    |
        | /home/user/file.txt.   | /    | /home/user | file.txt.  | .   | file.txt |
        | C:\temp\myfile.        | C:/  | C:/temp    | myfile.    | .   | myfile   |
        | ./dir/foo..            |      | ./dir      | foo..      | .   | foo.     |
        | ...                    |      | .          | ...        | .   | ..       |
        | ..                     |      | .          | ..         |     | ..       |

  Rule: The posix and win32 namespaces give the same results as extname

    @happy
    Scenario Outline: Namespaced extname
      When <namespace>.extname is called with "<path>"
      Then it returns "<ext>"

      Examples:
        | namespace | path             | ext |
        | posix     | index.           | .   |
        | win32     | C:\temp\myfile.  | .   |
        | posix     | ..               |     |
        | win32     | ...              | .   |
```

Decided:

- A last segment ending with a dot (`"index."`, `"file.txt."`, `"foo.."`) gives `"."`, not `""`.
  - Ticket: "fix(extname): handle inputs ending with dot (#203)"
  - Instead: return `""`, treating a trailing dot as no extension (the current behaviour).
- Paths of dots: only the whole inputs `"."` and `".."` give `""`. `"..."`, `"...."` and so on give `"."`, which matches Node and settles the `"..."` TODO in the tests. A last segment `"."` or `".."` after a separator (`"/."`, `"/.."`, `"a/."`, `"a/.."`, `"./.."`, `"C:\.."`) gives `"."`, unlike Node.
  - Ticket: silent.
  - Instead: give `""` whenever the last segment is `"."` or `".."`, as Node does, so that `"/.."` and `"a/.."` would give `""`.
- Dotfile names ending with a dot (`".index."`) give `"."`, as Node does.
  - Ticket: silent.
  - Instead: give `""`, treating a leading-dot name as having no extension at all.
- A path ending with `/` or `\` still gives `""`, even when the name before it ends with a dot (`"index./"`) or has an extension (`"index.js/"`). This keeps the current behaviour and differs from Node, which gives `"."` and `".js"`.
  - Ticket: silent.
  - Instead: strip trailing separators first, as Node and pathe's own `basename` do.
- A drive-relative input such as `"C:."` is an ordinary segment and gives `"."`, as Node's posix `extname` does.
  - Ticket: silent.
  - Instead: give `""`, as Node's `win32.extname` does, treating `C:.` as the current directory on drive C.
- `parse` follows the new `extname`, with `name` equal to `base` minus that `ext` (`"index."` → name `"index"`, `"..."` → name `".."`), and its code stays the same.
  - Ticket: "The change keeps the exports' names and signatures."
  - Instead: leave `parse`'s `ext` and `name` as they were for inputs ending with a dot.
- Windows backslashes are normalised before the trailing dot is found (`"C:\temp\myfile."` → `"."`), as the existing `extname` already does.
  - Ticket: silent.
  - Instead: look at the raw input, so that only `/` counts as a separator.
