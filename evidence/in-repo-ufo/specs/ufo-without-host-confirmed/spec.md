# Add `withoutHost` utility

Ticket #212 asks for a new `withoutHost` utility in `src/utils.ts`. It takes a URL
string and returns only its path, query and fragment, dropping the protocol,
credentials, host and port. Like `withoutFragment`, `withQuery` and `getQuery`
next to it, the function is built on the existing `parseURL` from `src/parse.ts`.
How it splits an input is therefore exactly how `parseURL` splits that input,
and this spec gives the results that follow from that, edge cases included.

## Interface

In `src/utils.ts` (and re-exported unchanged from `src/index.ts` through the
existing `export * from "./utils"`):

```ts
export function withoutHost(input: string);
```

- The declaration is exactly as the ticket gives it. The return type is
  inferred and is `string`.
- Definition: let `parsed = parseURL(input)` (with no `defaultProto`). The result
  is `(parsed.pathname || "/") + parsed.search + parsed.hash`. Every part is
  used verbatim, with no encoding, decoding or other normalisation.
- `withoutHost` is pure. It never mutates anything, it returns the same output
  for the same input, and it never throws for a `string` input.
- No new types or constants are exported. All existing exports of
  `src/utils.ts`, `src/parse.ts` and `src/index.ts` keep their current
  behaviour. This includes `parseURL`, `withoutProtocol`, `withoutFragment`,
  `withoutBase` and `withoutLeadingSlash`.

```gherkin
Feature: withoutHost removes protocol, auth, host and port from a URL

  Background:
    Given withoutHost is imported from "src/utils.ts"
    And every quoted or tabled input and output is the literal character sequence shown, with no escape processing, so "\" is one backslash character

  Rule: For a URL with a host, the result is its pathname followed by its search and hash, unchanged

    @happy
    Scenario Outline: Protocol, credentials, host and port are removed
      When withoutHost is called with "<input>"
      Then the result is "<output>"

      Examples:
        | input                                    | output              |
        | http://example.com/foo                   | /foo                |
        | https://example.com/foo?q=123            | /foo?q=123          |
        | http://foo.com/test?query=123#hash       | /test?query=123#hash |
        | http://user:pass@example.com:8080/a?b#c  | /a?b#c              |
        | http://example.com:8080/api/v1/          | /api/v1/            |
        | ws://localhost:3000/socket?x=1           | /socket?x=1         |
        | http://[::1]:3000/x                      | /x                  |
        | HTTP://Example.COM/Foo                   | /Foo                |

    @happy
    Scenario: The package entry point exposes the same function
      When withoutHost is imported from "src/index.ts" and called with "https://example.com/docs#intro"
      Then the result is "/docs#intro"

  Rule: When the pathname is empty, the result's pathname is "/"; search and hash still follow it

    @boundary
    Scenario Outline: An empty pathname becomes "/"
      When withoutHost is called with "<input>"
      Then the result is "<output>"

      Examples:
        | input                     | output |
        | http://example.com        | /      |
        | http://example.com/       | /      |
        | http://example.com:8080   | /      |
        | http://user@example.com   | /      |
        | https://example.com?q=1   | /?q=1  |
        | https://example.com#x     | /#x    |
        | https://                  | /      |

  Rule: Path, search and hash are returned verbatim, with no normalisation

    @boundary
    Scenario Outline: Encoding, case, repeated slashes, trailing slashes and empty markers are preserved
      When withoutHost is called with "<input>"
      Then the result is "<output>"

      Examples:
        | input                                     | output                     |
        | http://example.com/foo%20bar              | /foo%20bar                 |
        | http://example.com/über?q=ä b#frag ment   | /über?q=ä b#frag ment      |
        | http://example.com//foo//bar              | //foo//bar                 |
        | http://example.com/foo?#                  | /foo?#                     |
        | https://example.com/a?b=c?d#e#f           | /a?b=c?d#e#f               |

    @boundary
    Scenario: Backslashes in a URL with a host are read as slashes, as parseURL does
      When withoutHost is called with "https:\\example.com\foo\bar"
      Then the result is "/foo/bar"

  Rule: Leading whitespace and NUL characters before the protocol are ignored, as parseURL does

    @boundary
    Scenario: Leading spaces before the protocol
      When withoutHost is called with two space characters followed by "https://example.com/x"
      Then the result is "/x"

    @boundary
    Scenario: A leading NUL character before the protocol
      When withoutHost is called with the character U+0000 followed by "https://example.com/x"
      Then the result is "/x"

  Rule: A protocol-relative input treats its first segment as the host and removes it

    @boundary
    Scenario Outline: Protocol-relative input
      When withoutHost is called with "<input>"
      Then the result is "<output>"

      Examples:
        | input                | output |
        | //example.com/foo    | /foo   |
        | //example.com        | /      |
        | /\example.com/foo    | /foo   |

  Rule: An input without a protocol or host is split into path, search and hash and returned with only an empty path replaced by "/"; no leading slash is added to a non-empty relative path

    @happy
    Scenario Outline: Host-less input
      When withoutHost is called with "<input>"
      Then the result is "<output>"

      Examples:
        | input       | output      |
        | /foo?q=1#x  | /foo?q=1#x  |
        | /           | /           |
        | foo/bar     | foo/bar     |
        | foo?x#y     | foo?x#y     |
        | /foo\bar    | /foo\bar    |

    @boundary
    Scenario Outline: Host-less input with an empty path
      When withoutHost is called with "<input>"
      Then the result is "<output>"

      Examples:
        | input | output |
        | ?q=1  | /?q=1  |
        | #h    | /#h    |

    @boundary
    Scenario: The empty string
      When withoutHost is called with ""
      Then the result is "/"

  Rule: For blob:, data:, javascript: and vbscript: inputs (any case), the result is everything after the protocol, unchanged and without an added leading slash

    @unhappy
    Scenario Outline: Script and opaque-data protocols
      When withoutHost is called with "<input>"
      Then the result is "<output>"

      Examples:
        | input                          | output                   |
        | javascript:alert(1)            | alert(1)                 |
        | JavaScript:alert(1)            | alert(1)                 |
        | data:text/plain,hi             | text/plain,hi            |
        | blob:https://example.com/uuid  | https://example.com/uuid |

  Rule: Any other protocol not followed by "//" yields "/", because parseURL finds no path in it

    @unhappy
    Scenario Outline: Non-hierarchical protocols
      When withoutHost is called with "<input>"
      Then the result is "/"

      Examples:
        | input            |
        | mailto:a@b.com   |
        | tel:123          |
        | custom:/foo      |

  Rule: A file URL keeps its path; a Windows drive letter loses the slash before it, as parseURL does

    @boundary
    Scenario Outline: File URLs
      When withoutHost is called with "<input>"
      Then the result is "<output>"

      Examples:
        | input               | output     |
        | file:///home/user   | /home/user |
        | file:///C:/foo      | C:/foo     |

  Rule: The function is not idempotent; a result that starts with "//" is read as protocol-relative when passed back in

    @boundary
    Scenario: Calling withoutHost on its own result
      Given withoutHost called with "http://example.com//foo//bar" returns "//foo//bar"
      When withoutHost is called with "//foo//bar"
      Then the result is "//bar"
```

Decided:
- Use `parseURL` to split the input, with an empty pathname replaced by `"/"` and search and hash appended unchanged.
  Ticket: "export function withoutHost(input: string);"
  Instead: Use the WHATWG `URL` constructor, which throws on relative input and normalises the path.
- Return `"/"` when the pathname is empty, including the empty string and query-only or hash-only input.
  Ticket: silent.
  Instead: Return `""` for an empty pathname.
- Keep path, search and hash exactly as given: no encoding, decoding, case change, slash collapsing or trailing-slash change, and keep empty `?` and `#`.
  Ticket: silent.
  Instead: Normalise the output like `normalizeURL`, so encoding is applied and an empty `?` or `#` is dropped.
- Return host-less relative input such as `foo/bar` unchanged, without adding a leading slash.
  Ticket: silent.
  Instead: Always prefix a leading slash (`withLeadingSlash`).
- Treat protocol-relative input (`//host/...`, `/\host/...`) as having a host, and remove that host.
  Ticket: silent.
  Instead: Treat it as a path and return it unchanged.
- For `blob:`, `data:`, `javascript:` and `vbscript:`, return everything after the protocol verbatim.
  Ticket: silent.
  Instead: Return the input unchanged, or return `"/"`.
- For other protocols not followed by `//` (`mailto:`, `tel:`, `custom:/foo`), return `"/"`.
  Ticket: silent.
  Instead: Return the input unchanged, or return the part after the protocol, as `withoutProtocol` does.
- In URLs with a protocol or that are protocol-relative, convert backslashes to `/`. In host-less paths, keep them.
  Ticket: silent.
  Instead: Never rewrite backslashes.
- Ignore leading whitespace and NUL characters before a protocol.
  Ticket: silent.
  Instead: Treat input with leading whitespace as a relative path and return it unchanged.
- Drop the slash before a Windows drive letter in a file URL (`file:///C:/foo` → `C:/foo`).
  Ticket: silent.
  Instead: Keep it (`/C:/foo`).
- Make no idempotency guarantee: a result starting with `//` is re-read as protocol-relative.
  Ticket: silent.
  Instead: Collapse a leading `//` in the result to `/` so the function becomes idempotent.
- Return type is `string`, inferred, while the ticket's declaration is kept as written.
  Ticket: "export function withoutHost(input: string);"
  Instead: Add an explicit `: string` return annotation.
- Never throw for string input, and add no runtime type check. Non-string arguments are a compile-time error only.
  Ticket: silent.
  Instead: Throw a `TypeError` for non-string input, as `resolveURL` does.
