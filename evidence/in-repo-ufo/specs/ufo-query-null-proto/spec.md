# parseQuery returns an object with a null prototype

`parseQuery` in `src/query.ts` builds its result in a plain `{}` literal. That
object inherits from `Object.prototype`, so `object[key] === undefined` is false
for keys such as `toString`, `valueOf` or `hasOwnProperty`. Those keys then go
down the "repeated key" branch. Today `parseQuery("toString=foo")` returns
`{ toString: [Object.prototype.toString, "foo"] }` instead of
`{ toString: "foo" }`. The fix (#286) makes `parseQuery` build its result with
`Object.create(null)`. Keys named after `Object.prototype` members are then
ordinary query keys, and the result inherits nothing.

**Exports of `src/query.ts`.** The names and signatures stay as they are:

```ts
export type QueryValue =
  | string | number | undefined | null | boolean
  | Array<QueryValue> | Record<string, any>;
export type QueryObject = Record<string, QueryValue | QueryValue[]>;
export type ParsedQuery = Record<string, string | string[]>;

export function parseQuery<T extends ParsedQuery = ParsedQuery>(parametersString?: string): T; // default ""
export function encodeQueryItem(key: string, value: QueryValue | QueryValue[]): string;
export function stringifyQuery(query: QueryObject): string;
```

- `parseQuery` changes only as the rules below describe. Everything else stays
  the same:
  - a leading `?` is dropped;
  - the input is split on `&`;
  - keys and values are decoded with `decodeQueryKey` / `decodeQueryValue`;
  - a key with no `=` gets the value `""`;
  - key order is the order in which each key first appears;
  - a repeated key collects its values into a `string[]` in input order.
- `encodeQueryItem`, `stringifyQuery` and the three types behave exactly as
  they do now. No new exports are added.
- How tests compare results: compare by own enumerable properties, for example
  with vitest `toEqual` against a literal, or with `Object.keys`. Check the
  prototype separately with `Object.getPrototypeOf`. Don't use `toStrictEqual`
  against an object literal. It compares constructors, and a null-prototype
  object has none.

```gherkin
Feature: parseQuery returns a null-prototype object

  Background:
    Given "parseQuery" and "stringifyQuery" are imported from "src/query"

  Rule: The object parseQuery returns has a null prototype and inherits nothing

    @happy
    Scenario: A non-empty query yields a null-prototype object
      When I call parseQuery("a=1&b=2")
      Then Object.getPrototypeOf(result) is null
      And the result equals { a: "1", b: "2" }

    @boundary
    Scenario Outline: An empty query yields an empty null-prototype object
      When I call parseQuery(<input>)
      Then Object.getPrototypeOf(result) is null
      And Object.keys(result) is []

      Examples:
        | input       |
        | ""          |
        | "?"         |
        | (no args)   |

    @boundary
    Scenario: The result exposes no inherited Object.prototype members
      When I call parseQuery("a=1")
      Then result.toString is undefined
      And result.hasOwnProperty is undefined
      And result.valueOf is undefined
      And "toString" in result is false

    @boundary
    Scenario: Only the top-level object has a null prototype
      When I call parseQuery("a=1&a=2")
      Then Array.isArray(result.a) is true
      And Object.getPrototypeOf(result.a) is Array.prototype
      And result.a equals ["1", "2"]

    @boundary
    Scenario: Every call returns a new object
      Given first = parseQuery("a=1")
      And I set first.b to "x"
      When I call second = parseQuery("a=1")
      Then second is not the same object as first
      And second equals { a: "1" }
      And Object.getPrototypeOf(second) is null

  Rule: Keys named after Object.prototype members are ordinary query keys

    @happy
    Scenario Outline: A single occurrence yields the decoded string value
      When I call parseQuery(<input>)
      Then Object.keys(result) is [<key>]
      And result[<key>] is <value>

      Examples:
        | input                    | key                    | value |
        | "toString=foo"           | "toString"             | "foo" |
        | "valueOf=1"              | "valueOf"              | "1"   |
        | "hasOwnProperty=x"       | "hasOwnProperty"       | "x"   |
        | "isPrototypeOf=y"        | "isPrototypeOf"        | "y"   |
        | "propertyIsEnumerable=z" | "propertyIsEnumerable" | "z"   |
        | "toLocaleString=l"       | "toLocaleString"       | "l"   |
        | "__defineGetter__=a"     | "__defineGetter__"     | "a"   |
        | "__lookupSetter__=b"     | "__lookupSetter__"     | "b"   |
        | "?toString=foo"          | "toString"             | "foo" |
        | "%74oString=foo"         | "toString"             | "foo" |

    @boundary
    Scenario: A key with no "=" yields an empty string, not an array
      When I call parseQuery("toString")
      Then the result equals { toString: "" }

    @happy
    Scenario Outline: A repeated key collects only the query's own values
      When I call parseQuery(<input>)
      Then result[<key>] equals <values>

      Examples:
        | input                           | key        | values          |
        | "toString=a&toString=b"         | "toString" | ["a", "b"]      |
        | "valueOf=1&valueOf=2&valueOf=3" | "valueOf"  | ["1", "2", "3"] |
        | "toString=&toString=x"          | "toString" | ["", "x"]       |

    @happy
    Scenario: Prototype-named keys mix with other keys in first-appearance order
      When I call parseQuery("a=1&toString=foo&b=2&a=3")
      Then Object.keys(result) is ["a", "toString", "b"]
      And the result equals { a: ["1", "3"], toString: "foo", b: "2" }

    @happy
    Scenario: The result round-trips through stringifyQuery
      When I call stringifyQuery(parseQuery("toString=foo&valueOf=1&valueOf=2"))
      Then the output is "toString=foo&valueOf=1&valueOf=2"

  Rule: "__proto__" and "constructor" are still dropped, matched on the decoded key exactly

    @unhappy
    Scenario Outline: The reserved keys never appear in the result
      When I call parseQuery(<input>)
      Then the result equals <output>
      And Object.getPrototypeOf(result) is null

      Examples:
        | input                               | output       |
        | "__proto__=x"                       | {}           |
        | "constructor=x"                     | {}           |
        | "__proto__"                         | {}           |
        | "%5F%5Fproto%5F%5F=x"               | {}           |
        | "constructor=x&constructor=y"       | {}           |
        | "a=1&__proto__=x&constructor=y&b=2" | { a: "1", b: "2" } |

    @boundary
    Scenario Outline: Keys that only resemble the reserved keys are kept
      When I call parseQuery(<input>)
      Then the result equals <output>

      Examples:
        | input             | output                 |
        | "__PROTO__=x"     | { "__PROTO__": "x" }   |
        | "Constructor=x"   | { "Constructor": "x" } |
        | "__proto__[]=x"   | { "__proto__[]": "x" } |
        | "prototype=x"     | { "prototype": "x" }   |
```

Decided:
- The returned top-level object has a null prototype (`Object.getPrototypeOf(result) === null`).
  Ticket: "fix(parseQuery): use object with null prototype (#286)"
  Instead: keep a `{}` result and test for keys with `Object.hasOwn`.
- `__proto__` and `constructor` are still dropped, even though a null-prototype object would make them safe to keep.
  Ticket: silent.
  Instead: treat them as ordinary keys now that a null prototype rules out prototype pollution.
- The reserved-key check uses the decoded key and is exact and case-sensitive (`%5F%5Fproto%5F%5F` is dropped; `__PROTO__`, `Constructor`, `__proto__[]` are kept).
  Ticket: silent.
  Instead: match the raw key, or match case-insensitively.
- Only the top-level object has a null prototype. Repeated-key values stay ordinary arrays (`Array.prototype`).
  Ticket: silent.
  Instead: also give array values a null prototype, or freeze them.
- A repeated key named after an `Object.prototype` member holds only its query values, in input order.
  Ticket: silent.
  Instead: drop every key named after an `Object.prototype` member, as is done for `__proto__`.
- The result has no inherited methods (`result.toString` is `undefined`). The other exports and the three types keep their current behaviour.
  Ticket: "The change keeps the exports' names and signatures."
  Instead: return a null-prototype copy only where it is needed, and keep the `{}` result for callers that call methods on it.
- Each call returns a new object and keeps no state between calls. `parseQuery` is synchronous, so calls cannot overlap and there is no `@concurrency` scenario.
  Ticket: silent.
  Instead: reuse a frozen shared empty object for empty input.
