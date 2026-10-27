# basename ignores trailing separators

`basename` in `src/path.ts` currently returns the text after the last `/`
of the normalised path (backslashes become `/` via `normalizeWindowsPath`).
For a path ending in a separator, such as `/temp/` or `C:\temp\`, that text
is empty, so `basename` returns `""` where Node.js returns `temp`. This
change makes `basename` skip trailing separators and return the last
non-empty segment. `parse` builds its `base`, `ext` and `name` fields from
`basename`, so it gets the fix as well.

## Interface

No exports are added, removed or renamed, and no signatures change. The
seam is still re-exported unchanged from `src/index.ts` (named and as
`default`).

```ts
export const basename: typeof path.basename; // (p: string, suffix?: string) => string
export const parse: typeof path.parse;       // (p: string) => path.ParsedPath
```

- `basename(p, extension?)`: the result is the **last non-empty segment**
  of `normalizeWindowsPath(p)` split on `/`. If there is no non-empty
  segment, the result is `""`. If `extension` is a non-empty string and the
  segment ends with it, that suffix is removed from the segment. This step
  is unchanged.
- `parse(p)`: still returns `{ root, dir, base, ext, name }`. `base` is
  `basename(p)`, `ext` is `extname(base)`, `name` is `base` without `ext`,
  `dir` is `dirname(p)` and `root` is worked out as before. Only `base`,
  `ext` and `name` change, and only for inputs that end in a separator.
- These keep their current behaviour exactly: `sep`, `delimiter`,
  `normalize`, `join`, `resolve`, `normalizeString`, `isAbsolute`,
  `toNamespacedPath`, `extname`, `relative`, `dirname` and `format`. Paths
  without a trailing separator give the same `basename` and `parse` results
  as before.
- All functions are pure and synchronous, so calls cannot overlap and there
  are no concurrency rules.

```gherkin
Feature: basename ignores trailing separators
  basename(p, extension?) returns the last non-empty "/"-separated segment
  of normalizeWindowsPath(p), with the extension suffix removed when it
  matches. parse(p) uses that basename for base, ext and name.

  Rule: Paths without a trailing separator keep their current result

    @happy
    Scenario Outline: Existing basename results are unchanged
      When basename is called with "<p>" and extension <extension>
      Then the result is "<result>"

      Examples:
        | p                     | extension | result      |
        | /temp/myfile.html     | undefined | myfile.html |
        | ./myfile.html         | undefined | myfile.html |
        | ./myfile.html         | ".html"   | myfile      |
        | ./undefined           | undefined | undefined   |
        | C:\temp\myfile.html   | undefined | myfile.html |
        | \temp\myfile.html     | undefined | myfile.html |
        | .\myfile.html         | ".html"   | myfile      |
        | myfile.html           | undefined | myfile.html |

  Rule: One or more trailing separators, "/" or "\" in any mix, are ignored

    @happy
    Scenario Outline: The segment before the trailing separators is returned
      When basename is called with "<p>"
      Then the result is "<result>"

      Examples:
        | p                      | result      |
        | /temp/                 | temp        |
        | /temp/myfile.html/     | myfile.html |
        | temp/                  | temp        |
        | C:\temp\               | temp        |
        | C:\temp\myfile.html\   | myfile.html |
        | \temp\                 | temp        |
        | //server/share/        | share       |
        | \\server\share\        | share       |

    @boundary
    Scenario Outline: Repeated and mixed trailing separators are all skipped
      When basename is called with "<p>"
      Then the result is "<result>"

      Examples:
        | p             | result |
        | /temp//       | temp   |
        | /temp///      | temp   |
        | /temp\/\      | temp   |
        | C:\temp\\     | temp   |

  Rule: Empty segments in the middle of a path do not affect the result

    @boundary
    Scenario Outline: Doubled inner separators are irrelevant
      When basename is called with "<p>"
      Then the result is "<result>"

      Examples:
        | p              | result |
        | /a//b          | b      |
        | /a//b//        | b      |
        | a\\b\          | b      |

  Rule: "." and ".." segments are returned literally, without resolving them

    @boundary
    Scenario Outline: Dot segments are not resolved
      When basename is called with "<p>"
      Then the result is "<result>"

      Examples:
        | p          | result |
        | ./         | .      |
        | ../        | ..     |
        | foo/./     | .      |
        | foo/bar/.. | ..     |
        | foo/bar/../ | ..     |

  Rule: A path with no non-empty segment has basename ""

    @boundary
    Scenario Outline: Root-only and empty paths
      When basename is called with "<p>"
      Then the result is ""

      Examples:
        | p    |
        |      |
        | /    |
        | //   |
        | ///  |
        | \    |
        | \\   |

    @boundary
    Scenario: An extension is not applied to an empty basename
      When basename is called with "/" and extension ".html"
      Then the result is ""

  Rule: A drive letter is an ordinary segment, as it already is without a trailing separator

    @boundary
    Scenario Outline: Drive-letter-only paths return the drive
      When basename is called with "<p>"
      Then the result is "<result>"

      Examples:
        | p    | result |
        | C:   | C:     |
        | C:\  | C:     |
        | C:/  | C:     |
        | c:\  | C:     |

  Rule: The extension is matched against the segment without its trailing separators

    @happy
    Scenario Outline: A matching extension is removed after skipping trailing separators
      When basename is called with "<p>" and extension "<extension>"
      Then the result is "<result>"

      Examples:
        | p                     | extension | result      |
        | /temp/myfile.html/    | .html     | myfile      |
        | /temp/myfile.html//   | .html     | myfile      |
        | C:\temp\myfile.html\  | .html     | myfile      |
        | /temp/myfile.html/    | .txt      | myfile.html |
        | /temp/myfile.html/    | html      | myfile.     |

    @boundary
    Scenario: An extension containing a separator never matches
      When basename is called with "/temp/myfile.html/" and extension ".html/"
      Then the result is "myfile.html"

    @boundary
    Scenario: An empty extension removes nothing
      When basename is called with "/temp/myfile.html/" and extension ""
      Then the result is "myfile.html"

    @boundary
    Scenario Outline: An extension equal to the whole segment leaves "" (unchanged rule)
      When basename is called with "<p>" and extension "<extension>"
      Then the result is ""

      Examples:
        | p           | extension |
        | /a/bbb      | bbb       |
        | /a/bbb/     | bbb       |
        | /a/.html/   | .html     |

  Rule: parse takes base, ext and name from the trailing-separator-aware basename

    @happy
    Scenario: POSIX directory path with a trailing separator
      When parse is called with "/home/user/dir/"
      Then the result is
        | root | dir        | base | ext | name |
        | /    | /home/user | dir  |     | dir  |

    @happy
    Scenario: File-like segment with a trailing separator keeps its extension
      When parse is called with "/home/user/file.txt/"
      Then the result is
        | root | dir        | base     | ext  | name |
        | /    | /home/user | file.txt | .txt | file |

    @happy
    Scenario: Windows path with a trailing separator
      When parse is called with "C:\path\dir\"
      Then the result is
        | root | dir     | base | ext | name |
        | C:   | C:/path | dir  |     | dir  |

    @boundary
    Scenario: dir still comes from the unchanged dirname, which removes only one trailing separator
      When parse is called with "/a/b//"
      Then the result is
        | root | dir  | base | ext | name |
        | /    | /a/b | b    |     | b    |

    @boundary
    Scenario: Root-only path
      When parse is called with "/"
      Then the result is
        | root | dir | base | ext | name |
        | /    | /   |      |     |      |

    @happy
    Scenario Outline: Existing parse results are unchanged
      When parse is called with "<p>"
      Then the result is root "<root>", dir "<dir>", base "<base>", ext "<ext>", name "<name>"

      Examples:
        | p                       | root | dir            | base     | ext  | name |
        | /home/user/dir/file.txt | /    | /home/user/dir | file.txt | .txt | file |
        | ./dir/file              | .    | ./dir          | file     |      | file |
        | C:\path\dir\file.txt    | C:   | C:/path/dir    | file.txt | .txt | file |
        | .\dir\file              | .    | ./dir          | file     |      | file |

  Rule: Other exports are not changed by this ticket

    @boundary
    Scenario Outline: extname and dirname keep their trailing-separator behaviour
      When <function> is called with "<p>"
      Then the result is "<result>"

      Examples:
        | function | p                  | result     |
        | extname  | /temp/myfile.html/ |            |
        | dirname  | /temp/             | /          |
        | dirname  | C:\temp\           | C:/        |
        | dirname  | /temp/myfile.html/ | /temp      |
```

In the tables, a `\` in a path is one literal backslash character (in test
code, write it as `String.raw` or `"\\"`). An empty cell means the empty
string `""`. `undefined` in the extension column means the argument is
`undefined`, or left out.

Behaviour for non-string arguments (`null`, numbers, objects) is outside
this change and is not specified. Tests must not call the functions with
them.

## Decided:

- A run of several trailing separators is skipped as a whole, not just the last one.
  - Ticket: "fix(basename): ignore trailing seperator (#180)"
  - Instead: strip exactly one trailing separator, the way `dirname` does (`.replace(/\/$/, "")`).
- `\` counts as a separator for this rule, because `normalizeWindowsPath` runs first.
  - Ticket: silent.
  - Instead: treat only `/` as a trailing separator (POSIX `path.posix.basename`).
- Empty segments in the middle of the path are ignored. The result is always the last non-empty segment.
  - Ticket: silent.
  - Instead: skip only the trailing empty segments and keep the rest of the split as it is. This gives the same result, but tests would then have to spell it out separately.
- A path with no non-empty segment (`""`, `/`, `//`, `\`) returns `""`, and does not throw.
  - Ticket: silent.
  - Instead: return `"/"` for root-only paths, or throw.
- Drive-only paths (`C:\`, `C:/`) return `C:`, the same as the current result for `C:`.
  - Ticket: silent.
  - Instead: return `""` for drive roots, like Node's `path.win32.basename`.
- `.` and `..` segments are returned as they are, with no normalisation.
  - Ticket: silent.
  - Instead: resolve the path with `normalize` first, so `foo/bar/..` would give `foo`.
- The extension is matched against the segment after trailing separators are skipped, so `/temp/myfile.html/` with `.html` gives `myfile`, and an extension containing `/` never matches.
  - Ticket: silent.
  - Instead: match the extension against the raw input, including its trailing separators.
- An extension equal to the whole segment still leaves `""` (the current pathe behaviour, which this change keeps).
  - Ticket: silent.
  - Instead: return the segment unchanged when the extension equals it, like Node.js (`basename("/a/bbb", "bbb") === "bbb"`).
- `parse` gets the fix through `basename` for `base`/`ext`/`name`, while `dir` still comes from the unchanged `dirname` (so `/a/b//` gives `dir` `/a/b`).
  - Ticket: silent.
  - Instead: also make `dirname` skip all trailing separators, so that `parse("/a/b//").dir` would be `/a`, like Node.js.
- `extname` and `dirname` are not changed (for example, `extname("/temp/myfile.html/")` stays `""`).
  - Ticket: "The change keeps the exports' names and signatures."
  - Instead: make `extname` ignore trailing separators too (Node gives `.html`).
- Behaviour for non-string arguments is left unspecified, and no input validation is added.
  - Ticket: silent.
  - Instead: throw a `TypeError` for non-string arguments, as Node.js does.
