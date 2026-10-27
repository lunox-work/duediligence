# Split `joinURL` into a plain join and a new relative-aware `joinRelativeURL`

In `src/utils.ts`, `joinURL(..._input)` currently splits every input on `/` and
resolves `.` and `..` segments. This change moves that relative-aware algorithm,
unchanged, into a new export `joinRelativeURL(..._input: string[]): string`.
It also restores `joinURL(base: string, ...input: string[]): string` as a plain
string join that adds one `/` between parts and never resolves `.` or `..`.
Both functions are synchronous, pure and keep no state, so calls cannot
overlap and no `@concurrency` scenarios apply. Both are re-exported from
`src/index.ts` (via `export * from "./utils"`), so tests may import them from
`../src` or `../src/utils`.

Exports from `src/utils.ts` after the change:

```ts
export function joinURL(base: string, ...input: string[]): string;

export function joinRelativeURL(..._input: string[]): string;
```

All other exports of `src/utils.ts` (`isRelative`, `hasProtocol`,
`isScriptProtocol`, `hasTrailingSlash`, `withoutTrailingSlash`,
`withTrailingSlash`, `hasLeadingSlash`, `withoutLeadingSlash`,
`withLeadingSlash`, `cleanDoubleSlashes`, `withBase`, `withoutBase`,
`withQuery`, `getQuery`, `isEmptyURL`, `isNonEmptyURL`, `withHttp`,
`withHttps`, `withoutProtocol`, `withProtocol`, `normalizeURL`, `resolveURL`,
`isSamePath`, `isEqual`, `withFragment`, `withoutFragment`, `withoutHost`, and
the type `HasProtocolOptions`) keep their signatures and behaviour. The one
exception is `withBase`: it still calls `joinURL`, so it now follows the new
`joinURL` rules (see the last Rule).

Neither function validates its arguments or throws. `""`, `undefined` and
`null` are handled as described below. Other non-string values are outside the
contract: the TypeScript signature rejects them, and no test should cover them.

```gherkin
Feature: joinURL and joinRelativeURL in src/utils.ts

  Rule: joinURL starts from base and adds each further input after exactly one "/"
    # Algorithm: url = base, or "" if base is falsy. Each further input that is
    # "", "/" or falsy is skipped. For each remaining input: if url is "", url
    # becomes that input unchanged. Otherwise, if url does not end with "/",
    # append "/"; then append the input with one leading "./" or "/" removed
    # (at most one, "./" checked first). Nothing else is changed.

    @happy
    Scenario Outline: joining plain segments
      When joinURL is called with arguments <args>
      Then the result is <out>

      Examples:
        | args                    | out           |
        | "a", "b"                | "a/b"         |
        | "a", "b", "c"           | "a/b/c"       |
        | "/a"                    | "/a"          |
        | "a/b", "c/d"            | "a/b/c/d"     |
        | "a", "b/", "c"          | "a/b/c"       |
        | "a", "b/", "/c"         | "a/b/c"       |
        | "/", "/b"               | "/b"          |
        | "a/", "b"               | "a/b"         |
        | "http://x.com", "b"     | "http://x.com/b" |
        | "http://x.com/", "/b"   | "http://x.com/b" |

    @happy
    Scenario Outline: a trailing slash on the last input is kept
      When joinURL is called with arguments <args>
      Then the result is <out>

      Examples:
        | args                    | out      |
        | "a", "b/"               | "a/b/"   |
        | "a", "/b/"              | "a/b/"   |
        | "/", "./foo/"           | "/foo/"  |

    @happy
    Scenario Outline: one leading "./" or "/" is removed from each input after the first
      When joinURL is called with arguments <args>
      Then the result is <out>

      Examples:
        | args                    | out         |
        | "./", "a"               | "./a"       |
        | "./a", "./b"            | "./a/b"     |
        | "a/", "./b"             | "a/b"       |
        | "/", "./foo"            | "/foo"      |
        | "/", "./foo", "bar"     | "/foo/bar"  |
        | "/", "./"               | "/"         |
        | "a", "./"               | "a/"        |

    @boundary
    Scenario Outline: only one leading "./" or "/" is removed, and the rest is kept as written
      When joinURL is called with arguments <args>
      Then the result is <out>

      Examples:
        | args                    | out         |
        | "a", "//b"              | "a//b"      |
        | "a", "././b"            | "a/./b"     |
        | "a", "/./b"             | "a/./b"     |
        | "a", "b//c"             | "a/b//c"    |

    @boundary
    Scenario Outline: "." and ".." are not resolved
      When joinURL is called with arguments <args>
      Then the result is <out>

      Examples:
        | args                    | out          |
        | "/a", "../b"            | "/a/../b"    |
        | "a", ".."               | "a/.."       |
        | "a", "."                | "a/."        |
        | "/a/b/c", "../../d"     | "/a/b/c/../../d" |

    @boundary
    Scenario Outline: query and fragment characters get no special handling
      When joinURL is called with arguments <args>
      Then the result is <out>

      Examples:
        | args                    | out          |
        | "/a?x=1", "b"           | "/a?x=1/b"   |
        | "/a#h", "b"             | "/a#h/b"     |

    @boundary
    Scenario Outline: inputs after base that are "" or "/" are skipped
      When joinURL is called with arguments <args>
      Then the result is <out>

      Examples:
        | args                    | out      |
        | "a", ""                 | "a"      |
        | "a", "/"                | "a"      |
        | "a/", "/"               | "a/"     |
        | "/a", "/"               | "/a"     |
        | "a", "/", "b"           | "a/b"    |
        | "", ""                  | ""       |

    @boundary
    Scenario Outline: base "/" is kept even when nothing follows it
      When joinURL is called with arguments <args>
      Then the result is <out>

      Examples:
        | args                    | out      |
        | "/"                     | "/"      |
        | "/", "/"                | "/"      |
        | "/", ""                 | "/"      |

    @unhappy
    Scenario Outline: an empty or missing base means the first kept input is used unchanged
      When joinURL is called with arguments <args>
      Then the result is <out>

      Examples:
        | args                    | out      |
        | (no arguments)          | ""       |
        | ""                      | ""       |
        | undefined               | ""       |
        | undefined, "./"         | "./"     |
        | undefined, "a", "b"     | "a/b"    |
        | "", "/a"                | "/a"     |
        | null, "/a"              | "/a"     |

  Rule: joinRelativeURL splits inputs on "/" and resolves "." and ".." with a net depth counter
    # Algorithm (the current joinURL body, moved unchanged):
    # 1. Drop falsy inputs ("", undefined, null). The remaining inputs are
    #    "the inputs"; "first" and "last" below refer to them.
    # 2. Split every input on "/". Skip empty parts and ".". A ".." removes the
    #    last kept segment, if there is one, and always lowers depth by 1. Any
    #    other part (including "...", "a\\b", "a?x=1", "a b") is kept as a
    #    segment and raises depth by 1. Depth starts at 0.
    # 3. url = kept segments joined with "/".
    # 4. If depth >= 0: prefix "/" when the first input starts with "/";
    #    otherwise prefix "./" when the first input starts with "./".
    #    If depth < 0: prefix "../" repeated -depth times, and ignore the first
    #    input's leading "/" or "./".
    # 5. If the last input ends with "/" and url does not, append "/".

    @happy
    Scenario Outline: joining segments without dot segments
      When joinRelativeURL is called with arguments <args>
      Then the result is <out>

      Examples:
        | args                    | out        |
        | "a", "b"                | "a/b"      |
        | "/a"                    | "/a"       |
        | "a", "/b"               | "a/b"      |
        | "/", "/b"               | "/b"       |
        | "/", "a"                | "/a"       |
        | "a", "b/", "c"          | "a/b/c"    |
        | "a", "b/", "/c"         | "a/b/c"    |
        | "/", "./foo"            | "/foo"     |
        | "/", "./foo", "bar"     | "/foo/bar" |

    @happy
    Scenario Outline: ".." removes the previous segment
      When joinRelativeURL is called with arguments <args>
      Then the result is <out>

      Examples:
        | args                    | out        |
        | "/a", "../b"            | "/b"       |
        | "/a/b/c", "../../d"     | "/a/d"     |
        | "/a", "../b", "./c"     | "/b/c"     |
        | "/a/b", "./c/../d"      | "/a/b/d"   |
        | "/a", "b", ".."         | "/a"       |

    @happy
    Scenario Outline: a leading "./" on the first input is kept while depth is not negative
      When joinRelativeURL is called with arguments <args>
      Then the result is <out>

      Examples:
        | args                    | out        |
        | "./", "a"               | "./a"      |
        | "./a", "./b"            | "./a/b"    |
        | "./a"                   | "./a"      |
        | "./a", "../b"           | "./b"      |
        | "./", "./"              | "./"       |
        | "./a", ".."             | "./"       |

    @boundary
    Scenario Outline: ".." past the start keeps a leading "/" while the net depth is still 0 or more
      When joinRelativeURL is called with arguments <args>
      Then the result is <out>

      Examples:
        | args                    | out      |
        | "/a", "../../d"         | "/d"     |
        | "/a", ".././../d"       | "/d"     |
        | "/a/b", "../../../d"    | "/d"     |
        | "/a", ".."              | "/"      |
        | "./a", "../../b"        | "./b"    |

    @boundary
    Scenario Outline: a negative net depth gives a "../" prefix per missing level and drops the leading "/" or "./"
      When joinRelativeURL is called with arguments <args>
      Then the result is <out>

      Examples:
        | args                    | out          |
        | "/a", "../../../d"      | "../d"       |
        | "/a", "../../../d/"     | "../d/"      |
        | "../a", "./../../b"     | "../b"       |
        | "../a", "../../../b"    | "../../b"    |
        | "../a", "../../../../b" | "../../../b" |
        | "./a", "../.."          | "../"        |
        | ".."                    | "../"        |
        | "../"                   | "../"        |

    @boundary
    Scenario Outline: a ".." that removes nothing still counts against later segments
      When joinRelativeURL is called with arguments <args>
      Then the result is <out>

      Examples:
        | args                    | out      |
        | "../a"                  | "a"      |
        | "../a", "b"             | "a/b"    |
        | "../a", "../b"          | "b"      |
        | "../a", "./../b"        | "b"      |
        | "../a/", "../b"         | "b"      |
        | "a/b/../../..", "c"     | "c"      |

    @boundary
    Scenario Outline: when every segment cancels out, only the prefix and trailing slash remain
      When joinRelativeURL is called with arguments <args>
      Then the result is <out>

      Examples:
        | args                    | out      |
        | "a", ".."               | ""       |
        | "a", "../"              | "/"      |
        | "/a", "../"             | "/"      |
        | "."                     | ""       |
        | ".", "a"                | "a"      |

    @boundary
    Scenario Outline: empty and "." parts are removed, so repeated slashes collapse
      When joinRelativeURL is called with arguments <args>
      Then the result is <out>

      Examples:
        | args                    | out             |
        | "a//b"                  | "a/b"           |
        | "a/./b"                 | "a/b"           |
        | "a/", "/b/", "c//"      | "a/b/c/"        |
        | "//"                    | "/"             |
        | "http://x.com", "b"     | "http:/x.com/b" |

    @boundary
    Scenario Outline: only "/" separates segments, and nothing else is special
      When joinRelativeURL is called with arguments <args>
      Then the result is <out>

      Examples:
        | args                    | out        |
        | "a", "...", "b"         | "a/.../b"  |
        | "a\\b", ".."            | ""         |
        | "/a?x=1", "../b"        | "/b"       |
        | "/a#h", "../b"          | "/b"       |
        | "/a b", "c"             | "/a b/c"   |

    @boundary
    Scenario Outline: the trailing slash comes only from the last input
      When joinRelativeURL is called with arguments <args>
      Then the result is <out>

      Examples:
        | args                    | out       |
        | "a/"                    | "a/"      |
        | "a", "b/"               | "a/b/"    |
        | "/a", "./b/"            | "/a/b/"   |
        | "/", "./foo/"           | "/foo/"   |
        | "/", "a/"               | "/a/"     |
        | "a", "b", "/"           | "a/b/"    |
        | "/a", "b", "../"        | "/a/"     |
        | "a/", "b"               | "a/b"     |

    @boundary
    Scenario Outline: "/" alone gives no segments but still counts as first or last input
      When joinRelativeURL is called with arguments <args>
      Then the result is <out>

      Examples:
        | args                    | out      |
        | "/"                     | "/"      |
        | "/", "./"               | "/"      |

    @unhappy
    Scenario Outline: falsy inputs are dropped before "first" and "last" are chosen
      When joinRelativeURL is called with arguments <args>
      Then the result is <out>

      Examples:
        | args                    | out      |
        | (no arguments)          | ""       |
        | ""                      | ""       |
        | "", ""                  | ""       |
        | "", "/a"                | "/a"     |
        | undefined, "./a"        | "./a"    |
        | null, "/a", undefined   | "/a"     |
        | "a/", ""                | "a/"     |
        | "a", "b", ""            | "a/b"    |
        | "a", "", "b/"           | "a/b/"   |

  Rule: withBase keeps its own checks and then calls the new joinURL
    # withBase(input, base) still returns input unchanged when base is "" or
    # "/", when input has a protocol, or when input already starts with base
    # (without its trailing slash). Otherwise it returns
    # joinURL(withoutTrailingSlash(base), input), so ".." in input is no longer
    # resolved.

    @happy
    Scenario Outline: withBase results that do not depend on dot segments are unchanged
      When withBase is called with input <input> and base <base>
      Then the result is <out>

      Examples:
        | input   | base    | out        |
        | "/bar"  | "/foo"  | "/foo/bar" |
        | ""      | "/foo"  | "/foo"     |
        | "/"     | "/foo/" | "/foo/"    |
        | "/base" | "/base/"| "/base"    |

    @boundary
    Scenario: withBase does not resolve ".." in the input
      When withBase is called with input "../bar" and base "/foo"
      Then the result is "/foo/../bar"
```

Decided:

- `joinURL` goes back to a plain join: each input after the first is added after one `/`, with one leading `./` or `/` removed, and `.`/`..` are never resolved.
  - Ticket: "export function joinURL(base: string, ...input: string[]): string;"
  - Instead: keep the current relative-aware `joinURL` and only change its parameter list.
- `joinURL` skips inputs after `base` that are `""` or `/`, and treats a falsy `base` as `""`.
  - Ticket: silent.
  - Instead: throw a `TypeError` on a non-string `base`, as `resolveURL` does.
- `joinURL` removes at most one leading `./` or `/` from each input after the first, so `"a", "//b"` gives `"a//b"`.
  - Ticket: silent.
  - Instead: remove all leading slashes so that the result never contains `//`.
- `joinRelativeURL` is the current `joinURL` algorithm moved unchanged, including the net depth counter (`"../a", "../b"` gives `"b"`; `"/a", "../../../d"` gives `"../d"`).
  - Ticket: "export function joinRelativeURL(..._input: string[]): string;"
  - Instead: resolve paths like RFC 3986 / POSIX (`"../a", "../b"` gives `"../b"`, and an absolute path never goes above `/`).
- `joinRelativeURL` gives `scheme://` no special treatment, so `"http://x.com", "b"` gives `"http:/x.com/b"`.
  - Ticket: silent.
  - Instead: detect a leading protocol and keep its `//`, giving `"http://x.com/b"`.
- Neither function treats `?` or `#` specially. Query and fragment text is part of the path string.
  - Ticket: silent.
  - Instead: parse with `parseURL`, join only the pathname, and keep search and hash.
- Neither function validates its input or throws. Falsy values are skipped, and other non-strings are outside the contract.
  - Ticket: silent.
  - Instead: throw a `TypeError` for any non-string argument.
- `withBase` keeps calling `joinURL`, so `withBase("../bar", "/foo")` now gives `"/foo/../bar"`.
  - Ticket: silent.
  - Instead: switch `withBase` to `joinRelativeURL` so that it keeps giving `"/bar"`.
