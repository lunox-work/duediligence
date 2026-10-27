# `format` accepts partial path objects

`format` in `src/_path.ts` builds a path string from a `path.FormatInputPathObject`
(`{ root?, dir?, base?, name?, ext? }`). Today it builds the file part as
`p.base ?? p.name + p.ext`, so any call that leaves out `base` together with
`name` or `ext` concatenates the string `"undefined"` into the result:
`format({ name: "file" })` returns `"fileundefined"` and `format({})` returns
`"undefinedundefined"` (issue #198). This change makes every field of the
object optional, as in Node.js `path.format`, and makes `ext` without a
leading dot get one, as Node.js does.

## Interface

The change keeps the exports' names and signatures. `src/_path.ts` still exports:

```ts
export const format: typeof path.format;
// i.e. (pathObject: path.FormatInputPathObject) => string
// path.FormatInputPathObject = {
//   root?: string; dir?: string; base?: string; ext?: string; name?: string;
// }
```

Only the body of `format` changes. No new exports, types or constants are
added. `sep`, `normalize`, `join`, `resolve`, `normalizeString`, `isAbsolute`,
`toNamespacedPath`, `extname`, `relative`, `dirname`, `basename`, `parse` and
`matchesGlob` keep their behaviour. `posix.format`, `win32.format` and the
default export's `format` (from `src/index.ts`) are the same function and
change with it.

## How the result is built

1. `ext` is turned into a suffix: if `ext` is missing or `""`, the suffix is
   `""`; if it starts with `"."`, the suffix is `ext` unchanged; otherwise the
   suffix is `"." + ext`.
2. The file part is `base` when `base` is not `undefined`/`null` (even when it
   is `""`); otherwise it is `(name ?? "") + suffix`.
3. The segments `[root, dir, filePart]` are kept in that order and every
   falsy one (`undefined`, `null`, `""`) is dropped.
4. If `root` is truthy the result is `resolve(...segments)`; otherwise it is
   the segments joined with `"/"`, with no other normalisation.
5. The result is passed through `normalizeWindowsPath` (backslashes become
   `/`, a leading lower-case drive letter is upper-cased).

A field that is `null` behaves exactly as if it were missing. The argument
itself must be an object: `format(undefined)` throws a `TypeError`.

```gherkin
Feature: format builds a path from a partial path object
  format(pathObject) returns a string built from whichever of root, dir,
  base, name and ext are given; missing fields contribute nothing.

  Rule: Missing name or ext contribute an empty string, never "undefined"

    @happy
    Scenario Outline: Partial objects without base
      When format is called with <input>
      Then the result is "<output>"

      Examples:
        | input                             | output        |
        | { name: "file" }                  | file          |
        | { ext: ".txt" }                   | .txt          |
        | { name: "file", ext: ".txt" }     | file.txt      |
        | { name: "file", ext: "" }         | file          |
        | { dir: "/home", name: "file" }    | /home/file    |
        | { dir: "/home", ext: ".txt" }     | /home/.txt    |
        | { dir: "a", ext: ".txt" }         | a/.txt        |
        | { root: "/", name: "file" }       | /file         |
        | { root: "/", ext: ".txt" }        | /.txt         |

    @boundary
    Scenario: An empty object formats to the empty string
      When format is called with {}
      Then the result is ""

    @boundary
    Scenario: Fields set to undefined explicitly are treated as missing
      When format is called with { root: undefined, dir: undefined, base: undefined, name: "file", ext: undefined }
      Then the result is "file"

    @boundary
    Scenario: Fields set to null are treated as missing
      When format is called with { root: null, dir: null, base: null, name: null, ext: null }
      Then the result is ""

  Rule: ext without a leading dot gets one; ext with a leading dot is used as given

    @happy
    Scenario Outline: Normalising ext
      When format is called with <input>
      Then the result is "<output>"

      Examples:
        | input                                    | output       |
        | { name: "file", ext: "txt" }             | file.txt     |
        | { ext: "txt" }                           | .txt         |
        | { name: "file", ext: "tar.gz" }          | file.tar.gz  |
        | { root: "/", name: "file", ext: "txt" }  | /file.txt    |
        | { dir: "/home", ext: "txt" }             | /home/.txt   |

    @boundary
    Scenario Outline: ext that already starts with a dot is not given another
      When format is called with <input>
      Then the result is "<output>"

      Examples:
        | input                           | output     |
        | { name: "file", ext: "." }      | file.      |
        | { name: "file", ext: "..txt" }  | file..txt  |

    @boundary
    Scenario: A name that starts with a dot and no ext is kept as is
      When format is called with { name: ".env" }
      Then the result is ".env"

  Rule: base, when given, wins over name and ext

    @happy
    Scenario Outline: base takes precedence
      When format is called with <input>
      Then the result is "<output>"

      Examples:
        | input                                       | output      |
        | { name: "file", base: "file.txt" }          | file.txt    |
        | { base: "file.md", ext: "txt" }             | file.md     |
        | { root: "/", base: "file.txt", ext: "ignored" } | /file.txt |

    @boundary
    Scenario: An empty-string base still counts as given
      When format is called with { base: "", name: "file", ext: ".txt" }
      Then the result is ""

  Rule: dir without a file part is returned without an added separator

    @boundary
    Scenario Outline: Only dir or only root
      When format is called with <input>
      Then the result is "<output>"

      Examples:
        | input                     | output        |
        | { dir: "/home/user" }     | /home/user    |
        | { dir: "home" }           | home          |
        | { dir: "/home/user/" }    | /home/user/   |
        | { root: "/" }             | /             |
        | { root: "/", dir: "/" }   | /             |

  Rule: Existing root, dir and Windows handling is unchanged

    @happy
    Scenario Outline: Full and Windows-style objects
      When format is called with <input>
      Then the result is "<output>"

      Examples:
        | input                                                       | output                    |
        | { root: "/ignored", dir: "/home/user/dir", base: "file.txt" } | /home/user/dir/file.txt |
        | { root: "/", dir: "/a/b", name: "f" }                       | /a/b/f                    |
        | { root: "/", name: "file", ext: ".txt" }                    | /file.txt                 |
        | { dir: "C:\\path\\dir", base: "file.txt" }                  | C:/path/dir/file.txt      |
        | { dir: "C:\\a", name: "file" }                              | C:/a/file                 |
        | { dir: "C:\\a\\b", ext: "txt" }                             | C:/a/b/.txt               |
        | { root: "C:\\", name: "file", ext: "txt" }                  | C:/file.txt               |

    @happy
    Scenario: posix and win32 namespaces share the change
      When posix.format and win32.format are each called with { name: "file", ext: "txt" }
      Then both results are "file.txt"

  Rule: The argument itself must be an object

    @unhappy
    Scenario: Calling format without a path object throws
      When format is called with undefined
      Then a TypeError is thrown
```

In the tables, `"C:\\a"` is the JavaScript string literal (one backslash in
the actual string).

Decided:
- Missing `name`, `ext` or both (and `{}`) contribute `""` instead of `"undefined"`.
  Ticket: "fix(format): allow calls with partial arguments (#198)"
  Instead: throw a `TypeError` naming the missing field.
- `ext` without a leading dot gets `"."` prepended; an `ext` already starting with `"."` (including `"."` and `"..txt"`) is used unchanged.
  Ticket: silent.
  Instead: use `ext` verbatim, as the current code and Node.js before v20 do.
- `null` fields are treated like missing fields.
  Ticket: silent.
  Instead: stringify `null` as `"null"` or throw.
- An explicit `base: ""` still counts as given, so `name` and `ext` are ignored and the file part is empty (keeps the existing `??`).
  Ticket: silent.
  Instead: Node.js's `base || name + ext`, which would give `"file.txt"`.
- A `dir` with no file part is returned without a trailing `/` (`{ dir: "/home/user" }` → `"/home/user"`), and an existing trailing `/` is kept as given.
  Ticket: silent.
  Instead: Node.js's `dir + "/" + ""`, which gives `"/home/user/"`.
- `root` without `dir` is still joined via `resolve`, so `{ root: "/", ext: "txt" }` → `"/.txt"`.
  Ticket: silent.
  Instead: return just the root when there is no name.
- `format(undefined)` keeps throwing a `TypeError`; only the object's fields are optional.
  Ticket: "The change keeps the exports' names and signatures."
  Instead: treat a missing argument as `{}` and return `""`.
