# Resolve the deployed image digest from the environment

Ticket #43 wants the API to report the digest of the container image it is
running, so that `GET /version` can be checked against the image's provenance
attestation. This change adds the seam only: a new module
`apps/api/src/image-digest.ts` that works out the image digest from an
environment object. CD already writes the commit sha into the task definition
as `BUILD_SHA` (see `.github/workflows/cd.yml`, "Register the task
definition"), and it will write the digest the same way as `IMAGE_DIGEST`. As
with the `BUILD_*` provenance values in `apps/api/src/env.ts`, a missing or
unusable digest leaves a gap in what the API reports. It is never a reason to
fail at boot. So the resolver returns `undefined` in those cases and never
throws or rejects.

## Exports

From `apps/api/src/image-digest.ts` (new file):

```ts
export async function resolveImageDigest(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined>;
```

- Reads `env.IMAGE_DIGEST` once, synchronously, before the returned promise
  is created. The promise resolves to the digest, with surrounding whitespace
  trimmed, if that value is a valid digest. In every other case it resolves to
  `undefined`.
- A valid digest is exactly `sha256:` followed by 64 lowercase hex characters
  (`/^sha256:[0-9a-f]{64}$/`), checked after trimming.
- It never throws synchronously and the promise never rejects.
- It reads no other key of `env`, never changes `env`, makes no network
  request, reads no file and writes nothing to the console.
- It keeps no cache. Each call reads `env` again at the moment it is called.

The module exports nothing else.

These existing exports keep their current behaviour, and this change does not
modify them:

- `apps/api/src/env.ts`: `parseEnv`, `buildInfo`, `appUrl`, `objectStoreConfig`
  and `Env`. `IMAGE_DIGEST` is not added to the env schema, so `parseEnv` still
  drops it and never fails because of it.
- `apps/api/src/routes.ts`: `createApp` and `AppOptions`. `GET /version` still
  returns the `BuildInfoDto` it was given, unchanged.
- `@sandbox-factory/shared`: `BuildInfoDto`, `unknownBuildInfo` and
  `buildInfoSchema` stay as they are.

The constants below are used in the scenarios:

- `DIGEST_A` = `"sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"`
- `DIGEST_B` = `"sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210"`

In tables, every value in a `value` column is a JSON string literal. `\n`,
`\t` and the spaces inside the quotes are part of the value.

```gherkin
Feature: resolveImageDigest reports the deployed image digest from the environment

  Background:
    Given DIGEST_A is "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    And DIGEST_B is "sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210"

  Rule: A well-formed IMAGE_DIGEST resolves to that digest

    @happy
    Scenario: The digest set by CD is returned verbatim
      Given env is { "IMAGE_DIGEST": DIGEST_A }
      When resolveImageDigest(env) is awaited
      Then the result is DIGEST_A

    @happy
    Scenario: Other keys in the environment do not affect the result
      Given env is { "IMAGE_DIGEST": DIGEST_B, "BUILD_SHA": "7f3a9c1e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a", "PORT": "4000" }
      When resolveImageDigest(env) is awaited
      Then the result is DIGEST_B

    @happy
    Scenario: The result is a Promise even though nothing is awaited inside
      Given env is { "IMAGE_DIGEST": DIGEST_A }
      When resolveImageDigest(env) is called without awaiting
      Then the return value is an instance of Promise
      And it resolves to DIGEST_A

    @happy
    Scenario: With no argument the resolver reads process.env
      Given process.env.IMAGE_DIGEST is set to DIGEST_A
      When resolveImageDigest() is awaited with no argument
      Then the result is DIGEST_A
      And after process.env.IMAGE_DIGEST is deleted, resolveImageDigest() resolves to undefined

  Rule: Surrounding whitespace is trimmed before the value is checked; any other whitespace makes it invalid

    @boundary
    Scenario Outline: Leading and trailing whitespace is removed
      Given env is { "IMAGE_DIGEST": <value> }
      When resolveImageDigest(env) is awaited
      Then the result is DIGEST_A

      Examples:
        | value                                                                                 |
        | "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\n"           |
        | "  sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef  "         |
        | "\tsha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\r\n"       |

    @unhappy
    Scenario: Whitespace inside the value is not removed
      Given env is { "IMAGE_DIGEST": "sha256: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" }
      When resolveImageDigest(env) is awaited
      Then the result is undefined

  Rule: A missing or empty IMAGE_DIGEST resolves to undefined

    @unhappy
    Scenario: IMAGE_DIGEST is not set
      Given env is {}
      When resolveImageDigest(env) is awaited
      Then the result is undefined

    @boundary
    Scenario Outline: An empty or whitespace-only value is treated as unset
      Given env is { "IMAGE_DIGEST": <value> }
      When resolveImageDigest(env) is awaited
      Then the result is undefined

      Examples:
        | value  |
        | ""     |
        | "   "  |
        | "\n"   |

    @unhappy
    Scenario: IMAGE_DIGEST is explicitly undefined
      Given env is { "IMAGE_DIGEST": undefined }
      When resolveImageDigest(env) is awaited
      Then the result is undefined

  Rule: Only "sha256:" followed by exactly 64 lowercase hex characters is accepted; anything else resolves to undefined and does not throw

    @boundary
    Scenario Outline: Values that look like a digest but are not exactly one
      Given env is { "IMAGE_DIGEST": <value> }
      When resolveImageDigest(env) is awaited
      Then the promise resolves rather than rejects
      And the result is undefined

      Examples:
        | case                         | value                                                                                                     |
        | 63 hex characters            | "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde"                                  |
        | 65 hex characters            | "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0"                                |
        | non-hex character            | "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdeg"                                 |
        | uppercase hex                | "sha256:0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF"                                 |
        | uppercase algorithm          | "SHA256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"                                 |
        | no algorithm prefix          | "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"                                        |
        | prefix without hex           | "sha256:"                                                                                                 |
        | other algorithm              | "sha512:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"                                 |
        | full image reference         | "123456789012.dkr.ecr.eu-west-1.amazonaws.com/sandbox-factory-api@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" |
        | tag instead of digest        | "sandbox-factory-api:7f3a9c1e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a"                                            |
        | placeholder                  | "unknown"                                                                                                 |

  Rule: The environment is read once, when the call is made, and never cached or modified

    @concurrency
    Scenario: Changing env after the call does not change the pending result
      Given env is { "IMAGE_DIGEST": DIGEST_A }
      When resolveImageDigest(env) is called and its promise is held without awaiting
      And env.IMAGE_DIGEST is then set to DIGEST_B
      And the held promise is awaited
      Then the result is DIGEST_A

    @concurrency
    Scenario: Overlapping calls each see the environment as it was when they were made
      Given env is { "IMAGE_DIGEST": DIGEST_A }
      When p1 = resolveImageDigest(env) is called
      And env.IMAGE_DIGEST is set to DIGEST_B
      And p2 = resolveImageDigest(env) is called
      And env.IMAGE_DIGEST is deleted
      And p3 = resolveImageDigest(env) is called
      And Promise.all([p1, p2, p3]) is awaited
      Then the results are [DIGEST_A, DIGEST_B, undefined]

    @concurrency
    Scenario: Concurrent calls on the same environment agree
      Given env is { "IMAGE_DIGEST": DIGEST_B }
      When resolveImageDigest(env) is called 10 times without awaiting and all are awaited together
      Then all 10 results are DIGEST_B

    @happy
    Scenario: The input environment is left unchanged
      Given env is { "IMAGE_DIGEST": "  sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\n", "BUILD_SHA": "abc" }
      When resolveImageDigest(env) is awaited
      Then the result is DIGEST_A
      And env deep-equals { "IMAGE_DIGEST": "  sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\n", "BUILD_SHA": "abc" }

  Rule: Existing env parsing and /version behaviour are unchanged

    @happy
    Scenario: parseEnv neither validates nor keeps IMAGE_DIGEST
      Given env is the required variables from apps/api/test/env.test.ts plus { "IMAGE_DIGEST": "not-a-digest" }
      When parseEnv(env) is called
      Then it does not throw
      And the returned Env has no IMAGE_DIGEST property

    @happy
    Scenario: GET /version still returns exactly the BuildInfoDto it was given
      Given createApp is given buildInfo { "version": "1.4.2", "gitSha": "7f3a9c1e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a", "gitShortSha": "7f3a9c1", "buildTime": "2026-11-01T12:00:00Z", "gitRef": "v1.4.2", "dirty": false }
      When GET /version is requested
      Then the status is 200
      And the JSON body deep-equals that buildInfo, with no imageDigest key
```

Decided:

- The digest comes from the environment variable `IMAGE_DIGEST`.
  - Ticket: silent.
  - Instead: fetch `ImageID` from the ECS task metadata endpoint at `ECS_CONTAINER_METADATA_URI_V4`.
- The resolver makes no network or file system access, even though it is async.
  - Ticket: "export async function resolveImageDigest(env: NodeJS.ProcessEnv = process.env): Promise<string | undefined>;"
  - Instead: use the async signature to call the container metadata endpoint with global `fetch`.
- The only accepted format is `sha256:` plus 64 lowercase hex characters.
  - Ticket: silent.
  - Instead: accept any OCI digest (`<algorithm>:<encoded>`), including `sha512:`.
- Uppercase hex or an uppercase `SHA256:` prefix is rejected, not lowercased.
  - Ticket: silent.
  - Instead: lowercase the value before checking it.
- Leading and trailing whitespace is trimmed before checking. Whitespace inside the value makes it invalid.
  - Ticket: silent.
  - Instead: reject any value that has surrounding whitespace.
- A bare 64-hex value without the `sha256:` prefix is rejected, not given the prefix.
  - Ticket: silent.
  - Instead: add `sha256:` to a bare 64-hex value.
- A full image reference (`repo@sha256:…`) is rejected, not reduced to the part after `@`.
  - Ticket: silent.
  - Instead: take the part after the last `@`.
- An invalid, empty or missing value resolves to `undefined`. The resolver never throws or rejects.
  - Ticket: silent.
  - Instead: throw (reject) on a malformed value, as `parseEnv` does for invalid config.
- `env` is read once, synchronously, at call time. Changes made after the call do not affect that call's result.
  - Ticket: silent.
  - Instead: read `env` after an `await`, so the value is whatever `env` holds when the promise settles.
- No cache: every call reads `env` again, so overlapping calls each reflect `env` as it was when they were made.
  - Ticket: silent.
  - Instead: cache the first resolved digest for the life of the process.
- `IMAGE_DIGEST` is not added to the `parseEnv` schema, so `parseEnv` neither validates nor keeps it.
  - Ticket: silent.
  - Instead: add `IMAGE_DIGEST: z.string().optional()` to `envSchema`.
- This change does not touch `BuildInfoDto` or the `GET /version` body. Adding the digest to `/version` is left to a separate change.
  - Ticket: "feat: attest the deployed image and report its digest at /version (#43)"
  - Instead: add an `imageDigest` field to `BuildInfoDto` and the `/version` response in this change.
- `resolveImageDigest` is the only export. It has no exported constant for the variable name or the pattern.
  - Ticket: silent.
  - Instead: also export `IMAGE_DIGEST_PATTERN` and the environment key name as constants.
