# `filterQuery`: keep only the query parameters a predicate accepts

Ticket #287 adds `filterQuery` to `src/utils.ts`. It takes a URL or path, decides which
query parameters to keep by calling a predicate once per parameter key, and returns the
input with only the kept parameters left in its query. It sits beside `withQuery` and
`getQuery` and is built from the same parts: `parseURL` / `stringifyParsedURL` from
`src/parse.ts` and `parseQuery` / `stringifyQuery` from `src/query.ts`. Because of that,
keys and values reach the predicate already decoded (the same as `getQuery`), and the
query that is written back is encoded the same way `withQuery` encodes it. `src/index.ts`
already re-exports everything from `src/utils.ts`, so `filterQuery` is available from both
`src/utils` and the package root (`src/index`).

## Interface

New export in `src/utils.ts`, exactly as the ticket gives it:

```ts
export function filterQuery(
  input: string,
  predicate: (key: string, value: string | string[]) => boolean,
): string;
```

- `input`: a URL or path in any form `parseURL` accepts (absolute, protocol-relative,
  path-only, query-only, or empty).
- `predicate(key, value)`: called with the decoded key and the decoded value from
  `parseQuery`. `value` is a `string` when the key appears once and a `string[]`
  (values in input order) when it appears more than once. A truthy return keeps the key
  and all its values. A falsy return drops them all.
- Returns the filtered URL as a `string`.

No other export is added, and no existing export changes. In particular `withQuery`,
`getQuery`, `parseURL`, `stringifyParsedURL`, `parseQuery`, `stringifyQuery`,
`encodeQueryItem` and the `QueryObject` / `ParsedQuery` / `ParsedURL` types keep their
current behaviour.

## Behaviour

```gherkin
Feature: filterQuery removes the query parameters a predicate rejects

  Background:
    Given "filterQuery" is imported from "src/utils"

  Rule: Parameters whose key the predicate rejects are removed, and everything else in the URL is preserved

    @happy
    Scenario: Removing one parameter from a path
      Given the predicate (key) => key !== "bar"
      When filterQuery is called with "/foo?bar=1&baz=2"
      Then the result is "/foo?baz=2"

    @happy
    Scenario: Keeping only the parameter the predicate accepts
      Given the predicate (key) => key !== "baz"
      When filterQuery is called with "/foo?bar=1&baz=2"
      Then the result is "/foo?bar=1"

    @happy
    Scenario: Protocol, auth, host, port, path and fragment are left as they are
      Given the predicate (key) => key === "b"
      When filterQuery is called with each input
      Then the result is the matching output:
        | input                                           | output                                     |
        | http://user:pw@example.com:8080/p?a=1&b=2#frag  | http://user:pw@example.com:8080/p?b=2#frag |
        | https://example.com?a=1&b=2                     | https://example.com?b=2                    |
        | //example.com/p?a=1&b=2                         | //example.com/p?b=2                        |
        | /foo?a=1&b=2#hash                               | /foo?b=2#hash                              |
        | ?a=1&b=2                                        | ?b=2                                       |

    @happy
    Scenario: The predicate's return value is read as truthy or falsy
      Given the predicate (key) => (key === "a" ? 1 : 0), cast to the predicate type
      When filterQuery is called with "/foo?a=1&b=2"
      Then the result is "/foo?a=1"

  Rule: When no parameters are left, the "?" is removed too

    @boundary
    Scenario: Every parameter is rejected
      Given the predicate () => false
      When filterQuery is called with each input
      Then the result is the matching output:
        | input                         | output                   |
        | /foo?bar=1&baz=2              | /foo                     |
        | /foo?bar=1&baz=2#hash         | /foo#hash                |
        | http://example.com/p?a=1#frag | http://example.com/p#frag |
        | ?a=1                          |                          |

    @boundary
    Scenario: An empty query is dropped without calling the predicate
      Given a predicate that records its calls and returns true
      When filterQuery is called with each input
      Then the result is the matching output:
        | input    | output  |
        | /foo?    | /foo    |
        | /foo?#h  | /foo#h  |
        | /foo?&&  | /foo    |
      And the predicate was not called

  Rule: An input with no "?" anywhere is returned exactly as given, and the predicate is not called

    @boundary
    Scenario: Inputs without a query are returned unchanged
      Given a predicate that records its calls and returns false
      When filterQuery is called with each input
      Then the result is identical to the input:
        | input                     |
        |                           |
        | /                         |
        | /foo                      |
        | http://example.com/a%20b  |
        | /foo#section              |
      And the predicate was not called

    @boundary
    Scenario: A "?" that is only inside the fragment is not a query
      Given a predicate that records its calls and returns false
      When filterQuery is called with "/foo#a?b=1"
      Then the result is "/foo#a?b=1"
      And the predicate was not called

  Rule: Script-protocol inputs (blob:, data:, javascript:, vbscript:) are returned exactly as given, and the predicate is not called

    @boundary
    Scenario: Special-protocol inputs are not rewritten
      Given a predicate that records its calls and returns false
      When filterQuery is called with each input
      Then the result is identical to the input:
        | input                        |
        | data:text/plain?a=1          |
        | javascript:alert(1)?a=1      |
        | JavaScript:void(0)?x=1       |
        | blob:https://e.com/id?a=1    |
      And the predicate was not called

  Rule: The predicate is called once per distinct key, with the decoded key and its decoded value or values, in parseQuery key order

    @happy
    Scenario: Each key is offered once with its single value
      Given a predicate that records its calls and returns true
      When filterQuery is called with "/foo?bar=1&baz=2"
      Then the predicate was called exactly 2 times
      And the recorded calls are, in order:
        | key | value |
        | bar | "1"   |
        | baz | "2"   |
      And every call received exactly 2 arguments

    @happy
    Scenario: A repeated key is offered once with an array of its values in input order
      Given a predicate that records its calls and returns true
      When filterQuery is called with "/foo?a=1&b=2&a=3"
      Then the recorded calls are, in order:
        | key | value      |
        | a   | ["1", "3"] |
        | b   | "2"        |

    @happy
    Scenario: Keys and values reach the predicate decoded
      Given a predicate that records its calls and returns true
      When filterQuery is called with "/foo?key%20x=b+c&u=%E5%A5%BD&e=%26"
      Then the recorded calls are, in order:
        | key   | value |
        | key x | "b c" |
        | u     | "好"  |
        | e     | "&"   |

    @boundary
    Scenario: A parameter with no "=" or an empty value is offered with the empty string
      Given a predicate that records its calls and returns true
      When filterQuery is called with "/foo?a=&b&c=1"
      Then the recorded calls are, in order:
        | key | value |
        | a   | ""    |
        | b   | ""    |
        | c   | "1"   |

    @boundary
    Scenario: Integer-like keys come first in ascending order, as in parseQuery and getQuery
      Given a predicate that records its calls and returns true
      When filterQuery is called with "/foo?b=1&2=x&1=y"
      Then the recorded keys are, in order: "1", "2", "b"
      And the result is "/foo?1=y&2=x&b=1"

  Rule: A repeated key is kept or dropped as a whole, and kept keys are written grouped, in the order the predicate saw them

    @happy
    Scenario: Keeping a repeated key keeps all its values together
      Given the predicate () => true
      When filterQuery is called with "/foo?a=1&b=2&a=3"
      Then the result is "/foo?a=1&a=3&b=2"

    @happy
    Scenario: Selecting by the shape of the value
      Given the predicate (key, value) => Array.isArray(value)
      When filterQuery is called with "/foo?a=1&b=2&a=3"
      Then the result is "/foo?a=1&a=3"

    @boundary
    Scenario: Empty values inside a repeated key are kept
      Given the predicate () => true
      When filterQuery is called with "/foo?a=1&a="
      Then the result is "/foo?a=1&a="

  Rule: When there is a query, the kept parameters are written again with stringifyQuery, so the query is normalised the way withQuery normalises it

    @happy
    Scenario: Kept parameters are encoded again
      Given the predicate () => true
      When filterQuery is called with each input
      Then the result is the matching output:
        | input                               | output                             |
        | /foo?a=b c&x=%E5%A5%BD&p=1+2        | /foo?a=b+c&x=%E5%A5%BD&p=1+2       |
        | /foo?key%20x=1                      | /foo?key+x=1                       |
        | /foo?a=&b&c=1                       | /foo?a&b&c=1                       |
        | /foo?a=1&&b=2                       | /foo?a=1&b=2                       |
        | /foo?a=%26                          | /foo?a=%26                         |
        | /foo?bar=1&baz=2                    | /foo?bar=1&baz=2                   |

    @boundary
    Scenario: A second "?" in the query belongs to the value
      Given a predicate that records its calls and returns true
      When filterQuery is called with "/foo?a=1?b=2"
      Then the recorded calls are, in order:
        | key | value   |
        | a   | "1?b=2" |
      And the result is "/foo?a=1?b=2"

  Rule: The keys "__proto__" and "constructor" are always removed and are never offered to the predicate, as in parseQuery

    @unhappy
    Scenario: Prototype-pollution keys are dropped
      Given a predicate that records its calls and returns true
      When filterQuery is called with "/foo?__proto__=1&constructor=2&a=3"
      Then the result is "/foo?a=3"
      And the recorded keys are, in order: "a"

  Rule: An error thrown by the predicate propagates unchanged, and no keys after it are offered

    @unhappy
    Scenario: The predicate throws
      Given a predicate that records its calls and throws new Error("boom") when key is "b"
      When filterQuery is called with "/foo?a=1&b=2&c=3"
      Then filterQuery throws that same Error with message "boom"
      And the recorded keys are, in order: "a", "b"

  Rule: Arguments of the wrong type are rejected with a TypeError before anything else happens

    @unhappy
    Scenario: input is not a string
      Given a predicate that records its calls and returns true
      When filterQuery is called with each input
      Then it throws a TypeError with the matching message:
        | input      | message                                                 |
        | undefined  | URL input should be string received undefined (undefined) |
        | null       | URL input should be string received object (null)       |
        | 42         | URL input should be string received number (42)         |
      And the predicate was not called

    @unhappy
    Scenario: predicate is not a function
      When filterQuery is called with the input and the predicate
      Then it throws a TypeError with the matching message:
        | input     | predicate | message                                                   |
        | /foo?a=1  | undefined | filterQuery predicate should be a function received undefined |
        | /foo      | true      | filterQuery predicate should be a function received boolean   |
        | /foo?a=1  | "a"       | filterQuery predicate should be a function received string    |

  Rule: filterQuery is synchronous and keeps no state, so calls nested inside a predicate and repeated calls are independent

    @concurrency
    Scenario: The predicate calls filterQuery on another URL
      Given an outer predicate that, for every key, calls filterQuery("/x?p=1&q=2", (k) => k === "q") and records the result, then returns key === "b"
      When filterQuery is called with "/foo?a=1&b=2" and the outer predicate
      Then the result is "/foo?b=2"
      And every recorded inner result is "/x?q=2"

    @concurrency
    Scenario: Repeated calls with the same arguments give the same result
      Given the predicate (key) => key !== "bar"
      When filterQuery is called twice with "/foo?bar=1&baz=2"
      Then both results are "/foo?baz=2"

    @boundary
    Scenario: The input string is not modified
      Given the input string "/foo?bar=1&baz=2"
      When filterQuery is called with it and the predicate () => false
      Then the result is "/foo"
      And the input string is still "/foo?bar=1&baz=2"
```

## Notes for the implementer

The obvious composition matches every scenario above: check the argument types, return
`input` if it has no `"?"` or if `isScriptProtocol(parseURL(input).protocol)` is true,
otherwise `parsed = parseURL(input)`, `query = parseQuery(parsed.search)`, keep the entries
of `Object.entries(query)` the predicate accepts (calling it as `predicate(key, value)`),
set `parsed.search = stringifyQuery(kept)` and return `stringifyParsedURL(parsed)`.
Add a JSDoc block with an `@example` and `@group utils`, like the other exports.

## Decided:

- An input with no `"?"` is returned exactly as given (not normalised), and the predicate is not called.
  - Ticket: silent.
  - Instead: always parse and rebuild the URL, so path or fragment encoding could change.
- When a query is present, it is written again with `stringifyQuery` (normalised encoding, `a=` becomes `a`, empty `&&` segments dropped), even if every key is kept.
  - Ticket: silent.
  - Instead: keep the original raw `key=value` segments byte for byte and only remove the rejected ones.
- When no parameters are left, the `"?"` is removed. That includes `"/foo?"`, which becomes `"/foo"`.
  - Ticket: silent.
  - Instead: leave a trailing `"?"`.
- The predicate is called once per distinct key, with a `string[]` for a repeated key, and it keeps or drops all of that key's values together.
  - Ticket: "export function filterQuery(input: string, predicate: (key: string, value: string | string[]) => boolean): string;"
  - Instead: call the predicate once per `key=value` pair, so single values of a repeated key can be dropped.
- Key order for both the predicate calls and the output follows `parseQuery` object order: integer-like keys first in ascending order, then other keys in first-appearance order. A repeated key's values are written together where the key first appears.
  - Ticket: silent.
  - Instead: strict first-appearance order of the original pairs.
- Keys and values reach the predicate decoded, the same as `getQuery`.
  - Ticket: "predicate: (key: string, value: string | string[]) => boolean"
  - Instead: pass the raw, still-encoded strings.
- The predicate's return value is read as truthy or falsy, like `Array.prototype.filter`.
  - Ticket: "=> boolean"
  - Instead: keep a key only when the predicate returns exactly `true`.
- `__proto__` and `constructor` keys are always removed and never offered to the predicate.
  - Ticket: silent.
  - Instead: offer them to the predicate and keep them if it accepts them.
- Script-protocol inputs (`blob:`, `data:`, `javascript:`, `vbscript:`) are returned unchanged. Rebuilding them through `stringifyParsedURL` would turn `data:x?a=1` into `data://x?a=1`.
  - Ticket: silent.
  - Instead: treat them like any other URL and rebuild them.
- An error thrown by the predicate propagates unchanged, and no later keys are offered.
  - Ticket: silent.
  - Instead: catch the error and treat it as "drop this key".
- A non-string `input` throws `TypeError("URL input should be string received <typeof> (<input>)")`, using `resolveURL`'s wording. A non-function `predicate` throws `TypeError("filterQuery predicate should be a function received <typeof>")`. Both checks run before anything else, even when the input has no `"?"`.
  - Ticket: silent.
  - Instead: no runtime checks, leaving whatever error (or none) the internals happen to produce.
- The function is synchronous and keeps no state, so `filterQuery` calls nested inside a predicate are independent and repeated calls give the same result.
  - Ticket: silent.
  - Instead: forbid re-entrant calls from the predicate.
