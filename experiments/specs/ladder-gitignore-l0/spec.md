# Ignored paths

`isIgnored(gitignore, path)` says whether git ignores the file at `path`
under the rules of one `.gitignore` file at the root of a repository.
`gitignore` is the file's text, lines separated by `\n`. `path` is relative
to the root and separated by `/`; its last component is a file and every
other component a directory. Matching is case-sensitive.

```gherkin
Feature: Ignored paths

  Rule: R1. Blank lines and comments match nothing
    A blank line matches nothing. A line whose first character is `#` is a
    comment and matches nothing. A pattern that starts with a literal `#`
    is written `\#`. Only a `#` in the first column starts a comment: a
    line that starts with a space and then `#` is a pattern whose name
    starts with that space. A line of spaces only is blank (rule R2).

    @happy
    Scenario: A comment line ignores nothing
      Given the gitignore "#notes.txt"
      Then "#notes.txt" is not ignored
      And "notes.txt" is not ignored

    @boundary
    Scenario: An escaped hash and a leading space make patterns, not comments
      Given the gitignore lines "\#notes.txt" and " #app.log"
      Then "#notes.txt" is ignored
      And " #app.log" is ignored
      And "#app.log" is not ignored

  Rule: R2. Trailing spaces are dropped unless escaped
    Spaces at the end of a line are removed before it is read as a pattern.
    A space preceded by a backslash is kept, as a literal space, along with
    any spaces before it. Spaces elsewhere in a line are part of the
    pattern.

    @happy
    Scenario: Unescaped trailing spaces are dropped
      Given the gitignore line "app.log" followed by three spaces
      Then "app.log" is ignored
      And "app.log " (with a trailing space) is not ignored

    @boundary
    Scenario: An escaped trailing space is kept
      Given the gitignore line "keep.txt\ " (backslash, then a space)
      Then "keep.txt " (with a trailing space) is ignored
      And "keep.txt" is not ignored

  Rule: R3. A leading ! negates a pattern
    A pattern that starts with `!` is negated: when it is the pattern that
    decides a path (rule R9), the path is not ignored. A pattern that
    starts with a literal `!` is written `\!`. A negated pattern that
    nothing earlier excluded changes nothing.

    @happy
    Scenario: A negation re-includes one file
      Given the gitignore lines "*.log" and "!keep.log"
      Then "keep.log" is not ignored
      And "src/keep.log" is not ignored
      And "other.log" is ignored

    @boundary
    Scenario: A negation before the pattern it means to undo has no effect
      Given the gitignore lines "!keep.log" and "*.log"
      Then "keep.log" is ignored

    @boundary
    Scenario: An escaped ! is a literal character
      Given the gitignore line "\!x.txt"
      Then "!x.txt" is ignored
      And "x.txt" is not ignored

  Rule: R4. A file in an excluded directory cannot be re-included
    A file is ignored when any of its parent directories is ignored, and
    no pattern can change that, not even a negated one naming the file.
    Directories are decided from the root down, each by the same rules as
    a path (rules R5 to R10) with the directory as the path: a directory
    inside an ignored directory is ignored. Only when no parent directory
    is ignored do the patterns decide the file itself.

    @happy
    Scenario: Excluding a directory excludes its files for good
      Given the gitignore lines "build/" and "!build/keep.txt"
      Then "build/keep.txt" is ignored

    @boundary
    Scenario: Excluding a directory's contents leaves room to re-include
      Given the gitignore lines "build/*" and "!build/keep.txt"
      Then "build/keep.txt" is not ignored
      And "build/main.c" is ignored

    @boundary
    Scenario: Re-including a directory, then a file inside it
      Given the gitignore lines "/out/*", "!/out/lib/", "/out/lib/*" and "!/out/lib/keep.txt"
      Then "out/lib/keep.txt" is not ignored
      And "out/lib/main.c" is ignored
      And "out/main.c" is ignored

  Rule: R5. A trailing slash matches directories only
    A pattern that ends with `/` matches only directories. The slash is
    removed before rules R6 to R8 are applied. Otherwise a pattern matches
    files and directories alike.

    @happy
    Scenario: A directory pattern ignores the directory's files
      Given the gitignore line "logs/"
      Then "logs/app.log" is ignored
      And "src/logs/app.log" is ignored

    @boundary
    Scenario: A directory pattern does not match a file of that name
      Given the gitignore line "logs/"
      Then "logs" is not ignored
      And "src/logs" is not ignored

  Rule: R6. A slash at the start or in the middle anchors a pattern
    After a trailing slash is removed, a pattern that still contains a `/`
    is matched against the whole path from the root, with a leading `/`
    dropped first. A pattern without a `/` is matched against the last
    component of the path, so it matches at any depth.

    @happy
    Scenario: A leading slash anchors to the root
      Given the gitignore line "/main.c"
      Then "main.c" is ignored
      And "src/main.c" is not ignored

    @boundary
    Scenario: A slash in the middle also anchors
      Given the gitignore line "src/main.c"
      Then "src/main.c" is ignored
      And "lib/src/main.c" is not ignored

    @happy
    Scenario: A pattern without a slash matches at any depth
      Given the gitignore line "main.c"
      Then "main.c" is ignored
      And "lib/src/main.c" is ignored

  Rule: R7. Wildcards never cross a slash
    `*` matches any run of characters, empty included, except `/`. `?`
    matches exactly one character except `/`. `[...]` matches one character
    from the set, where `a-z` is a range, and `[!...]` or `[^...]` one
    character not in it; it never matches `/`. A `[` with no closing `]` is
    a literal `[`. A backslash makes the next character literal. Every
    other character matches itself.

    @happy
    Scenario Outline: Wildcards
      Given the gitignore line "<pattern>"
      Then "<path>" is <result>

      Examples:
        | pattern   | path           | result      |
        | *.log     | src/app.log    | ignored     |
        | *.log     | app.log.bak    | not ignored |
        | src/*.js  | src/util.js    | ignored     |
        | src/*.js  | src/lib/util.js| not ignored |
        | ?.txt     | a.txt          | ignored     |
        | ?.txt     | ab.txt         | not ignored |
        | data[0-3] | data3          | ignored     |
        | data[0-3] | data4          | not ignored |
        | [!a]x     | bx             | ignored     |
        | [!a]x     | ax             | not ignored |
        | src?lib   | src/lib        | not ignored |

    @boundary
    Scenario: A backslash makes a wildcard literal
      Given the gitignore line "\*.txt"
      Then "*.txt" is ignored
      And "a.txt" is not ignored

  Rule: R8. Two asterisks span directories only between slashes
    `**/` at the start of a pattern matches in every directory, the root
    included. `/**` at the end matches everything inside. `/**/` in the
    middle matches zero or more directories. Any other run of two or more
    asterisks is a single `*`, and a pattern of only `**` matches every
    path.

    @happy
    Scenario Outline: Double asterisks
      Given the gitignore line "<pattern>"
      Then "<path>" is <result>

      Examples:
        | pattern           | path                  | result      |
        | **/main.c         | main.c                | ignored     |
        | **/main.c         | src/lib/main.c        | ignored     |
        | **/src/main.c     | lib/src/main.c        | ignored     |
        | **/src/main.c     | src/lib/main.c        | not ignored |
        | src/**            | src/lib/main.c        | ignored     |
        | src/**/main.c     | src/main.c            | ignored     |
        | src/**/main.c     | src/a/b/main.c        | ignored     |
        | src/**/main.c     | lib/src/main.c        | not ignored |

    @boundary
    Scenario: Asterisks not next to slashes are a single star
      Given the gitignore line "core**x"
      Then "corex" is ignored
      And "src/coreabx" is ignored
      And "corey" is not ignored

  Rule: R9. The last matching pattern decides
    Patterns are read top to bottom, and the last one that matches the path
    decides it: ignored, or not ignored when that pattern is negated. A
    path no pattern matches is not ignored.

    @happy
    Scenario: Later patterns override earlier ones
      Given the gitignore lines "*.txt", "!a*.txt" and "a1*.txt"
      Then "a1.txt" is ignored
      And "a2.txt" is not ignored
      And "b.txt" is ignored

  Rule: R10. A pattern that matches a directory ignores its contents
    Directories are matched by the same patterns as files, so a pattern
    without a slash that matches a directory's name, at any depth, makes
    that directory ignored and with it everything inside (rule R4).

    @happy
    Scenario: A bare name ignores a directory anywhere, and its contents
      Given the gitignore line "cache"
      Then "cache/data.json" is ignored
      And "src/lib/cache/x/data.json" is ignored
      And "src/cachex/data.json" is not ignored
```
