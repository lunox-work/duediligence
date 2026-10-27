# Readable values in NonExhaustiveError

`NonExhaustiveError` (src/errors.ts) is thrown when `.exhaustive()` finds no
pattern for its input. Its message shows the input, today through
`JSON.stringify`, which drops `undefined`, shows Maps and Sets as `{}`,
throws on a BigInt and has no length limit. The change adds one export to
src/errors.ts:

```ts
export function displayValue(value: unknown): string;
```

and builds the message as
`` `Pattern matching error: no pattern matches value ${displayValue(input)}` ``.
`NonExhaustiveError` keeps its name, its constructor and its public `input`
property, unchanged. Every other export of the package keeps its behaviour.

```gherkin
Feature: Readable values in NonExhaustiveError

  Rule: R1. What JSON can show is shown as JSON.stringify shows it
    null, booleans, finite numbers, strings, arrays and plain objects (whose
    prototype is Object.prototype or null) display exactly as
    JSON.stringify(value) returns them: no spaces, strings quoted and
    escaped, -0 as 0, symbol-keyed properties left out. An object with a
    toJSON method displays as the value toJSON() returns, so a valid Date is
    its quoted ISO string and an invalid Date is null.

    @happy
    Scenario Outline: JSON values
      When I call displayValue(<value>)
      Then the result is <text>

      Examples:
        | value                              | text                                |
        | { color: "orange" }                | '{"color":"orange"}'                |
        | [1, "a", null, true]               | '[1,"a",null,true]'                 |
        | "say \"hi\""                       | '"say \\"hi\\""'                    |
        | -0                                 | '0'                                 |
        | { a: { b: [] } }                   | '{"a":{"b":[]}}'                    |
        | new Date("2020-01-02T03:04:05Z")   | '"2020-01-02T03:04:05.000Z"'        |
        | Object.assign(Object.create(null), { k: 1 }) | '{"k":1}'                 |

    @happy
    Scenario: The existing message for a plain object is unchanged
      Given match({ color: "orange" }) with only a pattern for { color: "red" }
      When .exhaustive() throws
      Then the error is a NonExhaustiveError whose input is { color: "orange" }
      And its message is 'Pattern matching error: no pattern matches value {"color":"orange"}'

  Rule: R2. What JSON cannot show is shown, never dropped
    Inside arrays, objects, Maps and Sets the same rules apply at every
    depth.
    | value                         | display                                        |
    | undefined                     | undefined (as an object property too: "k":undefined) |
    | NaN, Infinity, -Infinity      | NaN, Infinity, -Infinity                       |
    | a bigint                      | its digits and n: 12n, -3n                     |
    | a symbol                      | String(symbol): Symbol(id), Symbol()           |
    | a function                    | [Function name], or [Function] with no name    |
    | an Error                      | [Name: message], the error's name and message  |
    | a Map                         | Map {key => value, ...}, entries in insertion order, ", " between them; Map {} when empty |
    | a Set                         | Set {value, ...}, in insertion order; Set {} when empty |
    | another object (a class instance) | its constructor's name, a space, then its own enumerable string-keyed properties as for a plain object: Point {"x":1} |

    @happy
    Scenario Outline: Values JSON cannot show
      When I call displayValue(<value>)
      Then the result is <text>

      Examples:
        | value                                   | text                             |
        | undefined                               | 'undefined'                      |
        | { a: 1, b: undefined }                  | '{"a":1,"b":undefined}'          |
        | [undefined, NaN, -Infinity]             | '[undefined,NaN,-Infinity]'      |
        | 12n                                     | '12n'                            |
        | { n: -3n }                              | '{"n":-3n}'                      |
        | Symbol("id")                            | 'Symbol(id)'                     |
        | function handler() {}                   | '[Function handler]'             |
        | new TypeError("boom")                   | '[TypeError: boom]'              |
        | new Map([["a", 1], [2, [3]]])           | 'Map {"a" => 1, 2 => [3]}'       |
        | new Set([1, "a"])                       | 'Set {1, "a"}'                   |
        | { m: new Map() , s: new Set() }         | '{"m":Map {},"s":Set {}}'        |
        | new (class Point { constructor() { this.x = 1 } })() | 'Point {"x":1}'     |

    @boundary
    Scenario: An anonymous function
      When I call displayValue((() => () => 1)())
      Then the result is '[Function]'

  Rule: R3. A value that contains itself is shown once
    When a value is reached again while it is still being displayed (it is
    its own ancestor), it displays as [Circular] there. A value that is only
    shared, reached twice but never inside itself, displays in full each
    time. displayValue never throws.

    @boundary
    Scenario: A circular object
      Given const a = { name: "a" }; a.self = a
      When I call displayValue(a)
      Then the result is '{"name":"a","self":[Circular]}'

    @boundary
    Scenario: A shared value is not circular
      Given const shared = { v: 1 }
      When I call displayValue([shared, shared])
      Then the result is '[{"v":1},{"v":1}]'

    @unhappy
    Scenario: A getter that throws does not escape
      Given const o = { get bad() { throw new Error("no") } }
      When I call displayValue(o)
      Then it does not throw
      And the result is '{"bad":[Error: no]}'

  Rule: R4. The display is at most 200 characters, then an ellipsis
    A display longer than 200 characters (UTF-16 code units, as
    String.prototype.length counts) is cut to its first 200 characters
    followed by "…" (U+2026), 201 characters in all. A display of exactly 200
    characters is not cut.

    @boundary
    Scenario: Exactly 200 characters is kept
      Given s is a string of 198 "x" characters
      When I call displayValue(s)
      Then the result is s in double quotes, 200 characters

    @boundary
    Scenario: 201 characters is cut
      Given s is a string of 199 "x" characters
      When I call displayValue(s)
      Then the result is a double quote, 199 "x" characters and "…", 201 characters

    @unhappy
    Scenario: A huge input does not flood the message
      Given an array of 100000 numbers 0 to 99999
      When .exhaustive() throws a NonExhaustiveError on it
      Then its message is 'Pattern matching error: no pattern matches value ' followed by the array's first 200 display characters and "…"
```

Decided:

- Plain JSON values keep JSON.stringify's exact output, compact, so today's
  message for plain objects is unchanged.
  Ticket: "The message we get for plain objects today should stay exactly as it is; we grep for it."
  Instead: a pretty-printed or util.inspect-style display.
- `undefined` is shown, as a top-level value, an array element and an
  object property (`"k":undefined`).
  Ticket: "`undefined` fields vanish"
  Instead: drop undefined properties as JSON does, or show them as null.
- BigInt displays as `12n`; NaN and the infinities by name.
  Ticket: "a BigInt makes stringify throw so we end up printing `[object Object]`"
  Instead: show a bigint as a quoted string.
- Maps and Sets display as `Map {k => v, ...}` and `Set {v, ...}` in
  insertion order.
  Ticket: "Maps and Sets print as `{}`"
  Instead: show them as arrays of entries, `[["a",1]]`.
- Class instances get their constructor's name in front; plain and
  null-prototype objects do not.
  Ticket: silent.
  Instead: show every object as a plain object.
- Functions are `[Function name]` or `[Function]`; Errors are
  `[Name: message]`; symbols are `Symbol(desc)`.
  Ticket: silent.
  Instead: leave them out as JSON does.
- Objects with toJSON (Dates) display what toJSON returns.
  Ticket: silent.
  Instead: show Dates as `Date(...)`.
- A value inside itself is `[Circular]`; shared values are shown in full.
  Ticket: silent.
  Instead: show every repeated reference as `[Circular]`.
- A getter that throws displays the error as a value; displayValue never
  throws.
  Ticket: silent.
  Instead: fall back to the old `${input}` display.
- The display is cut at 200 UTF-16 code units, then `…`.
  Ticket: "a large input dumps a megabyte into our logs. Please show the value readably and keep the message short."
  Instead: a limit of 1,000 characters, or `...` in ASCII.
