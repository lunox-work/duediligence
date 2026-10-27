# withBase / withoutBase: match the base only on a path-segment boundary

`withBase` and `withoutBase` in `src/utils.ts` decide whether `input` already
starts with `base` by calling plain `input.startsWith(_base)`, where `_base` is
`withoutTrailingSlash(base)`. That check also matches a base that is only a
string prefix of a longer segment. So `withoutBase("/apiv2", "/api")` returns
`"/v2"` and `withBase("/apiv2", "/api")` returns `"/apiv2"` without adding the
base (issue #313). After this change, a base counts as present only when it
ends on a path-segment boundary in `input`. Everything else about the two
functions stays the same.

## Interface

Exports of `src/utils.ts` that this change touches (the names and signatures
stay as they are; both are re-exported from `src/index.ts`):

```ts
export function withBase(input: string, base: string): string;
export function withoutBase(input: string, base: string): string;
```

- No new exports. Any helper added for the boundary check stays
  module-private. It is not exported from `src/utils.ts`, so it does not
  reach `src/index.ts`.
- `isEmptyURL`, `hasProtocol`, `withoutTrailingSlash`, `joinURL` and every
  other export of `src/utils.ts` keep their current behaviour.
- Both functions are synchronous and pure, so calls cannot overlap and there
  are no `@concurrency` scenarios.

## Definitions

- **normalized base**: `withoutTrailingSlash(base)`. This removes at most one
  trailing `/`, as the code does today (`"/api/"` becomes `"/api"`, and
  `"/api//"` becomes `"/api/"`).
- **base match**: `input` starts with the normalized base, compared
  case-sensitively and character by character with no decoding, **and** one of
  the following is true:
  1. `input` is exactly the normalized base (nothing comes after it), or
  2. the character right after the normalized base in `input` is `/` or `?`.

  Any other character after the base (a letter, a digit, `-`, `.`, `;`, `%`,
  `#`, `\`, and so on) means there is **no** base match. This holds even when
  the normalized base itself ends with `/`.

## Behaviour

- `withBase(input, base)`:
  - If `isEmptyURL(base)` or `hasProtocol(input)`, it returns `input`
    (unchanged).
  - If there is a base match, it returns `input`.
  - Otherwise it returns `joinURL(normalizedBase, input)`.
- `withoutBase(input, base)`:
  - If `isEmptyURL(base)`, it returns `input` (unchanged).
  - If there is no base match, it returns `input`.
  - Otherwise it removes the normalized base from the front of `input`. If
    the rest starts with `/`, it returns the rest. If not, it returns `"/"`
    followed by the rest.
- Neither function throws for any string arguments.

```gherkin
Feature: withBase and withoutBase only match a base that ends on a path-segment boundary

  Rule: withBase adds the base when it is only a string prefix of the input's first segment

    @unhappy
    Scenario Outline: base is a false prefix of a longer segment
      When withBase is called with input "<input>" and base "<base>"
      Then it returns "<out>"

      Examples:
        | input         | base     | out                 |
        | /apiv2        | /api     | /api/apiv2          |
        | /apiv2        | /api/    | /api/apiv2          |
        | /apiv2/users  | /api/    | /api/apiv2/users    |
        | /api-docs     | /api     | /api/api-docs       |
        | /api.json     | /api     | /api/api.json       |
        | /api;x        | /api     | /api/api;x          |
        | /api%2F       | /api     | /api/api%2F         |
        | /api#top      | /api     | /api/api#top        |
        | /api#         | /api     | /api/api#           |
        | /foo/barbaz   | /foo/bar | /foo/bar/foo/barbaz |

  Rule: withBase leaves the input alone when the base ends on a boundary

    @happy
    Scenario Outline: base followed by end of input, "/" or "?"
      When withBase is called with input "<input>" and base "<base>"
      Then it returns "<out>"

      Examples:
        | input        | base     | out          |
        | /api         | /api     | /api         |
        | /api/        | /api     | /api/        |
        | /api/users   | /api     | /api/users   |
        | /api?x=1     | /api     | /api?x=1     |
        | /api?        | /api     | /api?        |
        | /foo/bar/baz | /foo/bar | /foo/bar/baz |
        | /base        | /base/   | /base        |
        | /base/a      | /base/   | /base/a      |

  Rule: withoutBase leaves the input unchanged when the base is only a string prefix of the input's first segment

    @unhappy
    Scenario Outline: base is a false prefix of a longer segment
      When withoutBase is called with input "<input>" and base "<base>"
      Then it returns "<out>"

      Examples:
        | input                  | base                 | out                    |
        | /apiv2                 | /api                 | /apiv2                 |
        | /apiv2                 | /api/                | /apiv2                 |
        | /apiv2/users           | /api/                | /apiv2/users           |
        | /api-docs              | /api                 | /api-docs              |
        | /api.json              | /api                 | /api.json              |
        | /api;x                 | /api                 | /api;x                 |
        | /api%2F                | /api                 | /api%2F                |
        | /api#top               | /api                 | /api#top               |
        | /api#                  | /api                 | /api#                  |
        | /foo/barbaz            | /foo/bar             | /foo/barbaz            |
        | https://test.com/apiv2 | https://test.com/api | https://test.com/apiv2 |

  Rule: withoutBase removes the base when it ends on a boundary

    @happy
    Scenario Outline: base followed by end of input, "/" or "?"
      When withoutBase is called with input "<input>" and base "<base>"
      Then it returns "<out>"

      Examples:
        | input                  | base                 | out    |
        | /api                   | /api                 | /      |
        | /api/                  | /api                 | /      |
        | /api/users             | /api                 | /users |
        | /api?x=1               | /api                 | /?x=1  |
        | /api?                  | /api                 | /?     |
        | /foo/bar/baz           | /foo/bar             | /baz   |
        | /base                  | /base/               | /      |
        | /base/a                | /base/               | /a     |
        | https://test.com/api/x | https://test.com/api | /x     |

  Rule: a normalized base that still ends with "/" still needs a boundary after it

    @boundary
    Scenario Outline: base with a doubled trailing slash
      When <fn> is called with input "<input>" and base "/api//"
      Then it returns "<out>"

      Examples:
        | fn          | input   | out        |
        | withBase    | /api/x  | /api/api/x |
        | withBase    | /api//x | /api//x    |
        | withBase    | /api/   | /api/      |
        | withoutBase | /api/x  | /api/x     |
        | withoutBase | /api//x | /x         |
        | withoutBase | /api/   | /          |

  Rule: matching is case-sensitive and works on the raw characters, without decoding

    @boundary
    Scenario Outline: differently cased or encoded input does not match
      When <fn> is called with input "<input>" and base "/api"
      Then it returns "<out>"

      Examples:
        | fn          | input      | out            |
        | withBase    | /API/users | /api/API/users |
        | withoutBase | /API/users | /API/users     |
        | withBase    | /api%2Fx   | /api/api%2Fx   |
        | withoutBase | /api%2Fx   | /api%2Fx       |

    @boundary
    Scenario Outline: a backslash after the base is not a boundary
      When <fn> is called with input "/api\x" and base "/api"
      Then it returns "<out>"

      Examples:
        | fn          | out         |
        | withBase    | /api/api\x  |
        | withoutBase | /api\x      |

  Rule: the base must sit at the very start of the input

    @unhappy
    Scenario Outline: base appears later in the input or input has no leading slash
      When <fn> is called with input "<input>" and base "/api"
      Then it returns "<out>"

      Examples:
        | fn          | input  | out        |
        | withBase    | /a/api | /api/a/api |
        | withoutBase | /a/api | /a/api     |
        | withBase    | api/x  | /api/api/x |
        | withoutBase | api/x  | api/x      |

  Rule: the existing early returns are unchanged

    @boundary
    Scenario Outline: empty or root base returns the input unchanged
      When <fn> is called with input "<input>" and base "<base>"
      Then it returns "<out>"

      Examples:
        | fn          | input   | base | out     |
        | withBase    | /apiv2  |      | /apiv2  |
        | withBase    | /apiv2  | /    | /apiv2  |
        | withoutBase | /apiv2  |      | /apiv2  |
        | withoutBase | /apiv2  | /    | /apiv2  |
        | withoutBase | /test/  | /    | /test/  |
        | withoutBase | /?test  | /    | /?test  |

    @boundary
    Scenario Outline: withBase never prefixes an input that has a protocol
      When withBase is called with input "<input>" and base "<base>"
      Then it returns "<out>"

      Examples:
        | input                  | base                 | out                    |
        | https://test.com       | /base/               | https://test.com       |
        | https://test.com/apiv2 | https://test.com/api | https://test.com/apiv2 |
        | https://test.com/apiv2 | /api                 | https://test.com/apiv2 |

    @boundary
    Scenario Outline: empty or root input
      When <fn> is called with input "<input>" and base "<base>"
      Then it returns "<out>"

      Examples:
        | fn          | input | base  | out  |
        | withBase    |       | /foo  | /foo |
        | withBase    | /     | /foo/ | /foo |
        | withoutBase |       | /foo  |      |
        | withoutBase | /     | /foo  | /    |
        | withoutBase | /     | /foo/ | /    |
        | withoutBase | /bar  | /foo  | /bar |
```

In the tables, an empty cell means the empty string `""`, and `\` in
`/api\x` is one literal backslash character.

Decided:

- The characters after the base that count as a boundary are end of input, `/` and `?`. `#` and a backslash do not count, so `withBase("/api#top", "/api")` returns `"/api/api#top"` and `withoutBase("/api#top", "/api")` returns `"/api#top"`.
  - Ticket: "fix(withBase, withoutBase): prevent false prefix matches (#313)"
  - Instead: also accept `#`, so `withoutBase("/api#top", "/api")` would return `"/#top"`.
- A normalized base that still ends with `/` (for example from `"/api//"`) gets no special treatment: the character after it must still be end of input, `/` or `?`, so `withoutBase("/api/x", "/api//")` returns `"/api/x"` and `withBase("/api/x", "/api//")` returns `"/api/api/x"`.
  - Ticket: silent.
  - Instead: treat such a base as already ending on a boundary, so `withoutBase("/api/x", "/api//")` would return `"/x"`.
- Matching stays case-sensitive and works on raw, undecoded characters.
  - Ticket: silent.
  - Instead: decode percent-escapes or compare without case before checking the prefix.
- When there is no base match, `withBase` joins the base in front with `joinURL`, so `"/apiv2"` becomes `"/api/apiv2"`.
  - Ticket: "fix(withBase, withoutBase): prevent false prefix matches (#313)"
  - Instead: return `input` unchanged whenever it starts with the base string, which keeps the old `withBase` result.
- When there is no base match, `withoutBase` returns `input` unchanged and does not throw.
  - Ticket: "fix(withBase, withoutBase): prevent false prefix matches (#313)"
  - Instead: throw, or report that the base was not found.
- The boundary rule also applies when `base` has a protocol (for example `https://test.com/api`), and `withBase` still returns any input with a protocol unchanged.
  - Ticket: silent.
  - Instead: parse both values and compare only the pathname segments.
- The boundary check is a module-private helper and nothing new is exported.
  - Ticket: "The change keeps the exports' names and signatures."
  - Instead: export a public `hasBase(input, base)` helper.
