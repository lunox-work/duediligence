# parseURL: only normalize Windows drive letters for `file:` URLs

`parseURL` in `src/parse.ts` currently removes the `/` in front of anything
that looks like a Windows drive letter (`/C:`) in every URL that has a
protocol or is protocol-relative. That turns `http://test.com/C:/x` into the
pathname `C:/x`, so `stringifyParsedURL` rebuilds it as `http://test.comC:/x`.
After this change the slash is removed only when the protocol, as written in
the input, is exactly `file:`. Every other URL keeps its pathname exactly as
written, apart from the existing `\` → `/` replacement. For `file:` URLs the
removal works as before: the first `/X:` found anywhere after the host loses
its `/`, including in later path segments, the search and the hash
(`file:///x#/C:` gives the hash `#C:`).

**Exports from `src/parse.ts`.** Names and signatures stay the same:

- `parseURL(input?: string, defaultProto?: string): ParsedURL` (changed as described below)
- `parsePath(input?: string): ParsedURL` (unchanged)
- `parseAuth(input?: string): ParsedAuth` (unchanged)
- `parseHost(input?: string): ParsedHost` (unchanged)
- `stringifyParsedURL(parsed: Partial<ParsedURL>): string` (unchanged)
- `parseFilename(input?: string, { strict }): string | undefined` (code unchanged; it calls `parseURL`, so it uses the new pathname)
- `interface ParsedURL`, `interface ParsedAuth`, `interface ParsedHost` (unchanged)

No new exports. Nothing about `parseURL` changes except when the drive-letter
handling applies: the `blob:`/`data:`/`javascript:`/`vbscript:` branch, the
`parsePath` fallback for inputs without a protocol, `defaultProto`, protocol
lowercasing, `auth`, `host`, the `\` → `/` replacement, the split into
`search`/`hash`, and the `[protocolRelative]` flag all work as before. Callers
in `src/utils.ts` and `src/url.ts` get the new pathnames through `parseURL`.

**Definitions used below.**

- *Path* is what `parseURL` already treats as the part after the host. Once
  `\` has been replaced with `/` and the protocol, `//`, auth and host have been
  removed, the path is the rest of the string, still including any search and
  hash. It is empty or starts with `/`, `?` or `#`.
- *Drive-letter slash*: a `/` followed by one ASCII letter `A`–`Z` or `a`–`z`,
  then `:`. This is the regex `\/(?=[A-Za-z]:)`, not anchored, applied to the
  path. Only the first match in the path is removed.
- *File protocol*: the protocol that `parseURL` captures, as written in the
  input before lowercasing, is exactly `file:`. `FILE:` and `File:` do not
  count, even though the returned protocol is lowercased to `file:`.

Scenario outputs list the JSON-visible fields of the result, the same way
`test/parse.test.ts` compares them with `JSON.parse(JSON.stringify(...))`.

```gherkin
Feature: parseURL normalizes Windows drive letters only for file: URLs

  Rule: With a file protocol, a drive-letter slash loses its slash

    @happy
    Scenario Outline: file: URL with a drive letter as the first path segment
      When parseURL is called with "<input>"
      Then the result is protocol "file:", auth "", host "<host>", pathname "<pathname>", search "<search>", hash "<hash>"

      Examples:
        | input                       | host | pathname     | search | hash  |
        | file:///C:/home/user        |      | C:/home/user |        |       |
        | file:///c:/x                |      | c:/x         |        |       |
        | file:///Z:/x?y=1#top        |      | Z:/x         | ?y=1   | #top  |
        | file:///C:\\x               |      | C:/x         |        |       |
        | file://host/C:/x            | host | C:/x         |        |       |

    @boundary
    Scenario Outline: leading whitespace or NUL before the file protocol is skipped
      When parseURL is called with "<input>"
      Then the result is protocol "file:", auth "", host "", pathname "C:/x", search "", hash ""

      Examples:
        | input          |
        | \sfile:///C:/x |
        | \0file:///C:/x |

    @boundary
    Scenario: a bare drive letter with nothing after the colon
      When parseURL is called with "file:///C:"
      Then the result is protocol "file:", auth "", host "", pathname "C:", search "", hash ""

    @boundary
    Scenario: the drive letter keeps its case
      When parseURL is called with "file:///d:/Data"
      Then the pathname is "d:/Data"
      And the pathname is not "D:/Data"

    @happy
    Scenario: defaultProto "file://" leads to drive-letter normalization
      When parseURL is called with "/C:/x" and defaultProto "file://"
      Then the result is protocol "file:", auth "", host "", pathname "C:/x", search "", hash ""

  Rule: Without a file protocol, the pathname keeps its leading slash

    @happy
    Scenario Outline: a non-file URL whose path looks like a drive letter
      When parseURL is called with "<input>"
      Then the result is protocol "<protocol>", auth "", host "<host>", pathname "<pathname>", search "<search>", hash ""

      Examples:
        | input                    | protocol | host     | pathname | search |
        | http://test.com/C:/x     | http:    | test.com | /C:/x    |        |
        | https://e.com/a:b        | https:   | e.com    | /a:b     |        |
        | ftp://h/D:/x             | ftp:     | h        | /D:/x    |        |
        | https://e.com/C:?q=1     | https:   | e.com    | /C:      | ?q=1   |
        | http://test.com\\C:\\x   | http:    | test.com | /C:/x    |        |

    @boundary
    Scenario Outline: the file protocol is matched case-sensitively
      When parseURL is called with "<input>"
      Then the result is protocol "file:", auth "", host "", pathname "/C:/x", search "", hash ""

      Examples:
        | input         |
        | FILE:///C:/x  |
        | File:///C:/x  |

    @boundary
    Scenario: defaultProto "FILE://" does not normalize
      When parseURL is called with "/C:/x" and defaultProto "FILE://"
      Then the result is protocol "file:", auth "", host "", pathname "/C:/x", search "", hash ""

    @boundary
    Scenario: a protocol-relative URL is not a file URL
      When parseURL is called with "//host/C:/x"
      Then the result is protocol "", auth "", host "host", pathname "/C:/x", search "", hash ""
      And the result's [protocolRelative] flag is true

    @boundary
    Scenario: defaultProto other than "file://" does not normalize
      When parseURL is called with "/C:/x" and defaultProto "http://"
      Then the result is protocol "http:", auth "", host "", pathname "/C:/x", search "", hash ""

    @boundary
    Scenario: a protocol that only contains "file" is not the file protocol
      When parseURL is called with "files:///C:/x"
      Then the result is protocol "files:", auth "", host "", pathname "/C:/x", search "", hash ""

    @happy
    Scenario: a non-file URL survives a parse/stringify round trip
      Given parsed is parseURL("http://test.com/C:/x?y=1#h")
      When stringifyParsedURL is called with parsed
      Then the result is "http://test.com/C:/x?y=1#h"

  Rule: With a file protocol, the first drive-letter slash anywhere after the host is removed

    @boundary
    Scenario Outline: drive-letter-like text elsewhere in a file: URL loses its slash
      When parseURL is called with "<input>"
      Then the result is protocol "file:", auth "", host "<host>", pathname "<pathname>", search "<search>", hash "<hash>"

      Examples:
        | input                 | host | pathname    | search | hash |
        | file:///home/C:/x     |      | /homeC:/x   |        |      |
        | file://host/x/C:/y    | host | /xC:/y      |        |      |
        | file:///x?y=/C:       |      | /x          | ?y=C:  |      |
        | file:///x#/C:         |      | /x          |        | #C:  |
        | file:////C:/x         |      | /C:/x       |        |      |
        | file:///x/a:b/C:/y    |      | /xa:b/C:/y  |        |      |

    @unhappy
    Scenario Outline: a path with no single-letter drive is not changed
      When parseURL is called with "<input>"
      Then the result is protocol "file:", auth "", host "", pathname "<pathname>", search "", hash ""

      Examples:
        | input           | pathname   |
        | file:///CD:/x   | /CD:/x     |
        | file:///1:/x    | /1:/x      |
        | file:///C\|/x   | /C\|/x     |
        | file:///home/x  | /home/x    |
        | file:///é:/x    | /é:/x      |

    @boundary
    Scenario: a drive letter written where the host goes stays the host
      When parseURL is called with "file://C:/x"
      Then the result is protocol "file:", auth "", host "C:", pathname "/x", search "", hash ""

  Rule: Inputs outside this change keep their current results

    @happy
    Scenario Outline: inputs with no drive letter or no protocol are unchanged
      When parseURL is called with "<input>"
      Then the pathname is "<pathname>"

      Examples:
        | input                | pathname   |
        | file:///home/user    | /home/user |
        | /C:/x                | /C:/x      |
        | C:/x                 | C:/x       |
        | data:/C:/x           | /C:/x      |

    @happy
    Scenario: stringifying a file: drive-letter URL is unchanged
      Given parsed is parseURL("file:///C:/x")
      When stringifyParsedURL is called with parsed
      Then the result is "file://C:/x"

    @happy
    Scenario: parseFilename reads the last segment of a non-file drive-letter path
      When parseFilename is called with "http://e.com/C:/dir/a.txt" and { strict: true }
      Then the result is "a.txt"
```

Notes for the scenarios above. `\\` in a table cell is one backslash in the
JavaScript string, so `file:///C:\\x` is the source literal `"file:///C:\\x"`.
`\|` is a literal `|`, `\s` is one space character, and `\0` is the NUL
character.

Decided:

- The protocol check is case-sensitive: only `file:` as written normalizes. `FILE:///C:/x` and `File:///C:/x` return protocol `file:` but keep the pathname `/C:/x`.
  - Ticket: "fix(parseURL): only normalize windows drive letters with `file://` protocol (#246)"
  - Instead: compare the protocol without regard to case, so `FILE:///C:/x` gives `C:/x`.
- For `file:` URLs, the first `/` followed by a letter and `:` anywhere after the host is removed, as before this change. That gives `file:///home/C:/x` → `/homeC:/x`, `file:///x?y=/C:` → search `?y=C:`, `file:///x#/C:` → hash `#C:`, and `file:///x/a:b/C:/y` → `/xa:b/C:/y` (only the first match).
  - Ticket: silent.
  - Instead: normalize only when the drive letter comes first in the path and leave later segments, the search and the hash alone.
- With `file:////C:/x` (an extra slash), only the slash directly before the drive letter is removed, so the pathname is `/C:/x`.
  - Ticket: silent.
  - Instead: remove all leading slashes before a drive letter, giving `C:/x`.
- A drive letter is exactly one ASCII letter followed by `:`. `CD:`, digits, non-ASCII letters and the legacy `C|` form do not count.
  - Ticket: silent.
  - Instead: also accept the legacy `|` drive separator (`file:///C|/x` → `C:/x`), the way WHATWG URL parsing does.
- The drive letter keeps its case (`file:///d:/x` → `d:/x`).
  - Ticket: silent.
  - Instead: uppercase the drive letter.
- A file URL with a host (`file://host/C:/x`) is still normalized, to `C:/x`.
  - Ticket: silent.
  - Instead: normalize only when the host is empty (`file:///…`).
- `file://C:/x` keeps `C:` as the host and `/x` as the pathname. The host is not reinterpreted as a drive.
  - Ticket: silent.
  - Instead: treat a host that looks like a drive letter as the start of the path (`host ""`, `pathname "C:/x"`).
- Protocol-relative inputs (`//host/C:/x`) count as non-file and keep `/C:/x`.
  - Ticket: "only normalize windows drive letters with `file://` protocol"
  - Instead: assume `file:` for protocol-relative inputs.
- `defaultProto` decides through the URL it builds: `"file://"` normalizes and any other value, including `"FILE://"`, does not.
  - Ticket: silent.
  - Instead: never normalize when the protocol came from `defaultProto`.
- `stringifyParsedURL` is not changed, so `file:///C:/x` still round-trips to `file://C:/x`.
  - Ticket: silent.
  - Instead: have `stringifyParsedURL` add back a `/` before a drive-letter pathname for `file:` URLs.
