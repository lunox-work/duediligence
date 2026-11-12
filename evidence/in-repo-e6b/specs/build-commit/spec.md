# Build info: report and attest the commit each build came from

Each deployable (`api`, `web`, `extension`) needs to say which commit it was
built from, so a running build can be traced to the source and so a client
can confirm it is talking to an API built from the same commit. This change
adds a new module, `packages/shared/src/build-info.ts`, to
`@sandbox-factory/shared`. Like the rest of the package it is part of the wire
contract: it depends only on `zod`, has no I/O, and does not read the clock, the
environment or git. Callers collect the values (for example at build time) and
pass them in. `packages/shared/src/index.ts` re-exports everything from it
(`export * from "./build-info.js";`), so consumers import from
`@sandbox-factory/shared`. Tests may import from `../src/build-info.js` or
`../src/index.js`.

## Exports of `packages/shared/src/build-info.ts`

```ts
export const UNKNOWN_BUILD = "unknown";

/** z.object({ version, commit, builtAt, repository }), see the rules below. */
export const buildInfoSchema: z.ZodObject<…>;

export type BuildInfoDto = z.infer<typeof buildInfoSchema>;
// = { version: string; commit: string; builtAt: string; repository: string }

/** Body of the version endpoint: z.object({ build: buildInfoSchema }). */
export const versionResponseSchema: z.ZodObject<…>;

/** Every field is UNKNOWN_BUILD. The object is frozen. */
export const unknownBuildInfo: BuildInfoDto;

export function formatVersion(info: BuildInfoDto): string;
export function isIdentified(info: BuildInfoDto): boolean;
export function commitUrl(info: BuildInfoDto): string | undefined;
export function sameBuild(a: BuildInfoDto, b: BuildInfoDto): boolean;
export function buildBanner(name: string, info: BuildInfoDto): string;
```

No other exports are added. The existing exports of `src/index.ts`
(`titleSchema`, `todoFilterSchema`, `todoSchema`, `todoListSchema`,
`createTodoSchema`, `updateTodoSchema`, `errorSchema` and their DTO types)
are unchanged and keep their current behaviour.

### Field rules of `buildInfoSchema`

Every field is required. Each one is either the exact string `UNKNOWN_BUILD`
(`"unknown"`) or a value in the form below. Anything else fails to parse.

| Field        | Known form                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------- |
| `version`    | any non-empty string (for example `"0.3.0"`), kept as given                                   |
| `commit`     | a full 40-character lowercase hex SHA-1, `/^[0-9a-f]{40}$/`                                   |
| `builtAt`    | an ISO 8601 UTC datetime, the same rule as `todoSchema.createdAt` (`z.iso.datetime()`)        |
| `repository` | an absolute `https:` URL (`z.url({ protocol: /^https$/ })`), kept as given                    |

The object is a plain `z.object`, as the other schemas in this package are:
unknown keys are dropped from the parse result and do not cause an error.
Values are not trimmed, lowercased or otherwise normalised by the schema.

The five functions are pure. They do not validate their arguments: they are
specified only for values that `buildInfoSchema` accepts, and they do not
mutate them. None of them throws, except `buildBanner` as specified below.

```gherkin
Feature: Build info for the commit a build came from

  Background:
    Given SHA is "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678"
    And OTHER_SHA is "0123456789abcdef0123456789abcdef01234567"
    And REPO is "https://github.com/lunox-work/sandbox-factory"
    And a build info "known" with
      | version    | 0.3.0                     |
      | commit     | SHA                       |
      | builtAt    | 2026-11-04T12:00:00.000Z  |
      | repository | REPO                      |

  Rule: UNKNOWN_BUILD is the string "unknown" and unknownBuildInfo uses it for every field

    @happy
    Scenario: The unknown build info
      Then UNKNOWN_BUILD is "unknown"
      And unknownBuildInfo deep-equals
        | version | commit  | builtAt | repository |
        | unknown | unknown | unknown | unknown    |
      And buildInfoSchema.parse(unknownBuildInfo) deep-equals unknownBuildInfo

    @unhappy
    Scenario: unknownBuildInfo cannot be modified
      When code assigns "0.3.0" to unknownBuildInfo.version
      Then a TypeError is thrown
      And unknownBuildInfo.version is still "unknown"

  Rule: buildInfoSchema accepts a known value or "unknown" in each field

    @happy
    Scenario: A fully known build info parses to itself
      When buildInfoSchema parses "known"
      Then the result deep-equals "known"

    @happy
    Scenario Outline: Any single field may be "unknown"
      When buildInfoSchema parses "known" with <field> set to "unknown"
      Then parsing succeeds and <field> is "unknown"

      Examples:
        | field      |
        | version    |
        | commit     |
        | builtAt    |
        | repository |

    @boundary
    Scenario: Unknown keys are dropped
      When buildInfoSchema parses "known" plus the key "branch" with value "main"
      Then parsing succeeds
      And the result has no "branch" key and deep-equals "known"

    @boundary
    Scenario Outline: Accepted edge values
      When buildInfoSchema parses "known" with <field> set to <value>
      Then parsing succeeds and <field> is <value> unchanged

      Examples:
        | field      | value                                            |
        | version    | "v1"                                             |
        | version    | "0.3.0-rc.1+build.7"                             |
        | builtAt    | "2026-11-04T12:00:00Z"                           |
        | repository | "https://github.com/lunox-work/sandbox-factory/" |
        | repository | "https://example.com/team/repo.git"              |

  Rule: buildInfoSchema rejects a missing field and any value outside the known forms

    @unhappy
    Scenario Outline: A missing required field is rejected
      When buildInfoSchema safe-parses "known" without <field>
      Then success is false

      Examples:
        | field      |
        | version    |
        | commit     |
        | builtAt    |
        | repository |

    @unhappy
    Scenario Outline: Invalid field values are rejected
      When buildInfoSchema safe-parses "known" with <field> set to <value>
      Then success is false

      Examples:
        | field      | value                                                 | why                         |
        | version    | ""                                                    | empty                       |
        | version    | 3                                                     | not a string                |
        | commit     | "a1b2c3d"                                             | short SHA                   |
        | commit     | "a1b2c3d4e5f60718293a4b5c6d7e8f901234567"             | 39 characters               |
        | commit     | "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789"           | 41 characters               |
        | commit     | "A1B2C3D4E5F60718293A4B5C6D7E8F9012345678"            | uppercase                   |
        | commit     | "g1b2c3d4e5f60718293a4b5c6d7e8f9012345678"            | not hex                     |
        | commit     | "Unknown"                                             | sentinel is case-sensitive  |
        | commit     | ""                                                    | empty                       |
        | builtAt    | "2026-11-04"                                          | date only                   |
        | builtAt    | "2026-11-04T12:00:00+01:00"                           | offset other than Z         |
        | builtAt    | "yesterday"                                           | not a datetime              |
        | repository | "http://github.com/lunox-work/sandbox-factory"        | not https                   |
        | repository | "git+https://github.com/lunox-work/sandbox-factory.git" | not https                 |
        | repository | "github.com/lunox-work/sandbox-factory"               | not an absolute URL         |
        | repository | ""                                                    | empty                       |

  Rule: versionResponseSchema is the object { build: BuildInfoDto }

    @happy
    Scenario: A version response parses
      When versionResponseSchema parses { "build": "known" }
      Then the result deep-equals { "build": "known" }

    @happy
    Scenario: A version response for an unknown build parses
      When versionResponseSchema parses { "build": unknownBuildInfo }
      Then the result deep-equals { "build": unknownBuildInfo }

    @unhappy
    Scenario Outline: Malformed version responses are rejected
      When versionResponseSchema safe-parses <body>
      Then success is false

      Examples:
        | body                                       |
        | {}                                         |
        | "known" (the build info itself, unwrapped) |
        | { "build": "known" with commit "a1b2c3d" } |
        | { "build": null }                          |

  Rule: formatVersion is "<version> (<first 7 characters of commit>)", or "unknown" when both are unknown

    @happy
    Scenario Outline: Formatting a version
      Given "known" with version <version> and commit <commit>
      When formatVersion is called with it
      Then it returns <text>

      Examples:
        | version | commit  | text                |
        | 0.3.0   | SHA     | 0.3.0 (a1b2c3d)     |
        | 0.3.0   | unknown | 0.3.0 (unknown)     |
        | unknown | SHA     | unknown (a1b2c3d)   |
        | unknown | unknown | unknown             |

    @boundary
    Scenario: builtAt and repository do not affect the text
      When formatVersion is called with "known" with builtAt and repository set to "unknown"
      Then it returns "0.3.0 (a1b2c3d)"

    @boundary
    Scenario: The unknown build info
      When formatVersion is called with unknownBuildInfo
      Then it returns "unknown"

  Rule: isIdentified is true exactly when commit is not "unknown"

    @happy
    Scenario Outline: Identifying a build
      Given "known" with <changes>
      When isIdentified is called with it
      Then it returns <result>

      Examples:
        | changes                                         | result |
        | no changes                                      | true   |
        | version, builtAt and repository all "unknown"   | true   |
        | commit "unknown"                                | false  |

    @boundary
    Scenario: The unknown build info is not identified
      When isIdentified is called with unknownBuildInfo
      Then it returns false

  Rule: commitUrl is "<repository>/commit/<full commit>", or undefined when commit or repository is unknown

    @happy
    Scenario: URL for a known commit
      When commitUrl is called with "known"
      Then it returns "https://github.com/lunox-work/sandbox-factory/commit/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678"

    @boundary
    Scenario Outline: Trailing slashes, then one trailing ".git", are removed from repository
      Given "known" with repository <repository>
      When commitUrl is called with it
      Then it returns <url>

      Examples:
        | repository                                          | url                                                                                              |
        | https://github.com/lunox-work/sandbox-factory/      | https://github.com/lunox-work/sandbox-factory/commit/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678    |
        | https://github.com/lunox-work/sandbox-factory//     | https://github.com/lunox-work/sandbox-factory/commit/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678    |
        | https://github.com/lunox-work/sandbox-factory.git   | https://github.com/lunox-work/sandbox-factory/commit/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678    |
        | https://github.com/lunox-work/sandbox-factory.git/  | https://github.com/lunox-work/sandbox-factory/commit/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678    |
        | https://example.com/team/repo                       | https://example.com/team/repo/commit/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678                    |

    @unhappy
    Scenario Outline: No URL without both a commit and a repository
      Given "known" with <changes>
      When commitUrl is called with it
      Then it returns undefined

      Examples:
        | changes                                |
        | commit "unknown"                       |
        | repository "unknown"                   |
        | commit and repository both "unknown"   |

    @boundary
    Scenario: version and builtAt do not matter
      Given "known" with version and builtAt both "unknown"
      When commitUrl is called with it
      Then it returns "https://github.com/lunox-work/sandbox-factory/commit/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678"

  Rule: sameBuild is true exactly when both builds are identified and their commits are equal; an unknown commit matches nothing

    @happy
    Scenario: Same commit, different build details
      Given "a" is "known"
      And "b" is "known" with version "0.4.0", builtAt "2026-11-05T08:30:00.000Z" and repository "https://example.com/team/repo"
      When sameBuild is called with "a" and "b"
      Then it returns true

    @happy
    Scenario: Different commits
      Given "a" is "known"
      And "b" is "known" with commit OTHER_SHA
      When sameBuild is called with "a" and "b"
      Then it returns false

    @unhappy
    Scenario Outline: An unknown commit is never the same build
      When sameBuild is called with <a> and <b>
      Then it returns false

      Examples:
        | a                          | b                          |
        | "known"                    | unknownBuildInfo           |
        | unknownBuildInfo           | "known"                    |
        | unknownBuildInfo           | unknownBuildInfo           |
        | "known" with commit unknown | "known" with commit unknown |

    @boundary
    Scenario: A build is the same as itself when identified
      When sameBuild is called with "known" and "known"
      Then it returns true

    @boundary
    Scenario: The result does not depend on argument order
      Given "b" is "known" with commit OTHER_SHA
      Then sameBuild("known", "b") equals sameBuild("b", "known")
      And sameBuild("known", unknownBuildInfo) equals sameBuild(unknownBuildInfo, "known")

  Rule: buildBanner is "<trimmed name> <formatVersion(info)>", followed by " built <builtAt>" when builtAt is known

    @happy
    Scenario Outline: Banners
      Given "known" with <changes>
      When buildBanner is called with name <name> and it
      Then it returns <banner>

      Examples:
        | name    | changes                    | banner                                              |
        | "api"   | no changes                 | "api 0.3.0 (a1b2c3d) built 2026-11-04T12:00:00.000Z" |
        | "web"   | builtAt "unknown"          | "web 0.3.0 (a1b2c3d)"                               |
        | "api"   | commit "unknown"           | "api 0.3.0 (unknown) built 2026-11-04T12:00:00.000Z" |
        | "  api "| no changes                 | "api 0.3.0 (a1b2c3d) built 2026-11-04T12:00:00.000Z" |

    @boundary
    Scenario: Banner for the unknown build info
      When buildBanner is called with name "extension" and unknownBuildInfo
      Then it returns "extension unknown"

    @boundary
    Scenario: The repository is not part of the banner
      When buildBanner is called with name "api" and "known" with repository "unknown"
      Then it returns "api 0.3.0 (a1b2c3d) built 2026-11-04T12:00:00.000Z"

    @unhappy
    Scenario Outline: An empty name is rejected
      When buildBanner is called with name <name> and "known"
      Then a TypeError is thrown with message "A build banner needs a name."

      Examples:
        | name  |
        | ""    |
        | "   " |

  Rule: The functions are pure and do not change their arguments

    @boundary
    Scenario: Arguments are left as they were
      Given a deep copy of "known"
      When formatVersion, isIdentified, commitUrl, buildBanner("api", ·) and sameBuild(·, ·) are each called with "known"
      Then "known" still deep-equals the copy
      And calling each function again with the same arguments returns the same result
```

There are no `@concurrency` scenarios: every export is a pure function or an
immutable value, so overlapping calls cannot interact.

## Decided:

- Fields of `BuildInfoDto` are `version`, `commit`, `builtAt`, `repository`, all required strings.
  - Ticket: silent.
  - Instead: only `version` and `commit`, with the repository URL hard-coded as a constant.
- An unknown field holds the string `UNKNOWN_BUILD` rather than being omitted or `null`.
  - Ticket: `export const UNKNOWN_BUILD = "unknown";`
  - Instead: optional or nullable fields.
- `commit` must be a full 40-character lowercase hex SHA; short, uppercase and SHA-256 forms are rejected, not normalised.
  - Ticket: silent.
  - Instead: accept 7–40 hex characters in any case and lowercase them.
- `builtAt` uses the same ISO UTC datetime rule as `todoSchema.createdAt`; offsets other than `Z` are rejected.
  - Ticket: silent.
  - Instead: accept any ISO 8601 offset, or epoch milliseconds.
- `version` is any non-empty string, not checked against semver.
  - Ticket: silent.
  - Instead: require a semver string.
- `repository` must be an absolute `https:` URL; `http:` and `git+https:` are rejected.
  - Ticket: silent.
  - Instead: accept any URL or the `git+https://….git` form from `package.json`.
- Unknown keys are dropped, not rejected (plain `z.object`, as elsewhere in the package).
  - Ticket: silent.
  - Instead: `z.strictObject` rejecting extra keys.
- `versionResponseSchema` wraps the build info as `{ build: BuildInfoDto }`.
  - Ticket: `export const versionResponseSchema = …;`
  - Instead: the response body is the build info object itself.
- `unknownBuildInfo` is frozen, so assigning to it throws.
  - Ticket: `export const unknownBuildInfo: BuildInfoDto = …;`
  - Instead: a plain mutable object.
- `formatVersion` shows `"<version> (<7-char commit>)"` and collapses to `"unknown"` only when both are unknown; `builtAt` is not shown.
  - Ticket: `export function formatVersion(info: BuildInfoDto): string;`
  - Instead: show the full SHA, or `"<version>+<sha>"` semver build-metadata style.
- `isIdentified` depends on `commit` alone.
  - Ticket: `export function isIdentified(info: BuildInfoDto): boolean;`
  - Instead: require every field to be known.
- `commitUrl` returns `undefined` (not a throw or `""`) when commit or repository is unknown, and builds a GitHub-style `/commit/<full sha>` path after removing trailing `/` and one trailing `.git`.
  - Ticket: `export function commitUrl(info: BuildInfoDto): string | undefined;`
  - Instead: use the repository verbatim with no trimming.
- `sameBuild` compares only `commit`, and an unknown commit never matches, even another unknown one.
  - Ticket: `export function sameBuild(a: BuildInfoDto, b: BuildInfoDto): boolean;`
  - Instead: deep equality of all fields, under which two unknown builds are equal.
- `buildBanner` is `"<name> <formatVersion>"` plus `" built <builtAt>"` when known, with no repository or URL.
  - Ticket: `export function buildBanner(name: string, info: BuildInfoDto): string;`
  - Instead: a multi-line banner that includes the commit URL.
- `buildBanner` trims `name` and throws `TypeError("A build banner needs a name.")` when it is empty after trimming.
  - Ticket: silent.
  - Instead: use the name verbatim, empty included.
- The functions do not validate their arguments; behaviour is specified only for schema-valid input.
  - Ticket: silent.
  - Instead: parse the argument inside each function and throw on invalid input.
- The module is re-exported from `src/index.ts`.
  - Ticket: "In `packages/shared/src/build-info.ts`:"
  - Instead: expose it only through a separate subpath export.
