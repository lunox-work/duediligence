# GitHub App installations and repository pointers: the wire contract

Issue #66 connects an organization to GitHub through a GitHub App
installation and tracks the repositories that the organization points at.
The ticket gives only its title, so this spec defines the contract that
`packages/shared` adds for that feature. It is a set of zod schemas,
constants and inferred types, in the same style as the Jira contract in
`src/jira.ts`. There are two families of schemas, and they behave
differently:

- **`*ResponseSchema` (what GitHub sends).** These are permissive. Only the
  fields GitHub always sends are required. They use `.loose()`, so an unknown
  field is kept instead of failing the parse. This follows the doctrine
  `jira.ts` states.
- **`*DtoSchema`, list schemas and bodies (what we produce or accept from our
  own clients).** These are strict. Every field is required and resolved,
  enumerations are closed, and unknown keys are stripped (plain `z.object`).

Every new export can be imported from `packages/shared/src/index.ts`. The
developer may define them in a new `src/github.ts` and add
`export * from "./github.js";` to `index.ts`, which is how `jira.ts` is
exposed. All exports are pure schemas: they use no clock, network, storage or
shared state, so no calls can overlap.

## Exports added

```ts
// Closed vocabularies, in this exact order.
export const GITHUB_ACCOUNT_TYPES = ["user", "organization"] as const;
export const githubAccountTypeSchema = z.enum(GITHUB_ACCOUNT_TYPES);

export const GITHUB_REPOSITORY_SELECTIONS = ["all", "selected"] as const;
export const githubRepositorySelectionSchema = z.enum(GITHUB_REPOSITORY_SELECTIONS);

export const GITHUB_SETUP_ACTIONS = ["install", "update", "request"] as const;
export const githubSetupActionSchema = z.enum(GITHUB_SETUP_ACTIONS);

// "owner/name". The input is returned unchanged when valid.
export const githubRepositoryFullNameSchema: z.ZodType<string, string>;

// What GitHub sends (permissive, .loose()).
export const githubInstallationResponseSchema;            // object
export const githubRepositoryResponseSchema;              // object
export const githubInstallationRepositoriesResponseSchema; // object

// The setup URL's query string, which GitHub redirects the browser to after
// an install. Input keys are GitHub's (snake_case); output keys are camelCase.
export const githubSetupCallbackSchema;

// What we hand on (strict).
export const githubInstallationDtoSchema;
export const githubInstallationListSchema;      // { installations: GithubInstallationDto[] }
export const githubRepositoryDtoSchema;
export const githubRepositoryListSchema;        // { repositories: GithubRepositoryDto[] }
export const githubRepositoryPointerDtoSchema;
export const githubRepositoryPointerListSchema; // { pointers: GithubRepositoryPointerDto[] }

// Body for tracking a repository: POST .../github/repositories
export const trackRepositorySchema;

export type GithubAccountType = z.infer<typeof githubAccountTypeSchema>;
export type GithubRepositorySelection = z.infer<typeof githubRepositorySelectionSchema>;
export type GithubSetupAction = z.infer<typeof githubSetupActionSchema>;
export type GithubInstallationResponse = z.infer<typeof githubInstallationResponseSchema>;
export type GithubRepositoryResponse = z.infer<typeof githubRepositoryResponseSchema>;
export type GithubInstallationRepositoriesResponse = z.infer<typeof githubInstallationRepositoriesResponseSchema>;
export type GithubSetupCallback = z.infer<typeof githubSetupCallbackSchema>;
export type GithubInstallationDto = z.infer<typeof githubInstallationDtoSchema>;
export type GithubInstallationListDto = z.infer<typeof githubInstallationListSchema>;
export type GithubRepositoryDto = z.infer<typeof githubRepositoryDtoSchema>;
export type GithubRepositoryListDto = z.infer<typeof githubRepositoryListSchema>;
export type GithubRepositoryPointerDto = z.infer<typeof githubRepositoryPointerDtoSchema>;
export type GithubRepositoryPointerListDto = z.infer<typeof githubRepositoryPointerListSchema>;
export type TrackRepositoryInput = z.infer<typeof trackRepositorySchema>;
```

### Shapes

| Schema                                         | Field                  | Type (parsed output)                                                                |
| ---------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `githubInstallationResponseSchema` (loose)     | `id`                   | required; `number`, integer, ≥ 1, safe                                               |
|                                                | `account`              | optional, nullable; loose `{ login?: string; id?: number; type?: string }`          |
|                                                | `repository_selection` | optional `string` (any value; not checked against the enum)                         |
|                                                | `suspended_at`         | optional, nullable `string`                                                         |
| `githubRepositoryResponseSchema` (loose)       | `id`                   | required; `number`, integer, ≥ 1, safe                                               |
|                                                | `full_name`            | required `string` (any value; not checked against the full-name rule)               |
|                                                | `name`                 | optional `string`                                                                   |
|                                                | `owner`                | optional; loose `{ login?: string }`                                                |
|                                                | `private`              | optional `boolean`                                                                  |
|                                                | `default_branch`       | optional `string`                                                                   |
|                                                | `archived`             | optional `boolean`                                                                  |
| `githubInstallationRepositoriesResponseSchema` | `total_count`          | optional `number`                                                                   |
| (loose)                                        | `repositories`         | `GithubRepositoryResponse[]`, defaults to `[]`                                      |
| `githubSetupCallbackSchema`                    | input `installation_id`| optional GitHub id text (see Rule)                                                  |
|                                                | input `setup_action`   | required `GithubSetupAction`                                                        |
|                                                | input `state`          | required `string`, length ≥ 1                                                       |
|                                                | output                 | `{ installationId: number \| null; setupAction: GithubSetupAction; state: string }` |
| `githubInstallationDtoSchema`                  | `id`                   | `string`, length ≥ 1 (our row id)                                                   |
|                                                | `installationId`       | `number`, integer, ≥ 1, safe (GitHub's installation id)                              |
|                                                | `accountLogin`         | `string`, length ≥ 1                                                                |
|                                                | `accountType`          | `GithubAccountType`                                                                 |
|                                                | `repositorySelection`  | `GithubRepositorySelection`                                                         |
|                                                | `suspended`            | `boolean`                                                                           |
|                                                | `createdAt`            | `z.iso.datetime()` string                                                           |
| `githubRepositoryDtoSchema`                    | `externalId`           | GitHub id text (string)                                                             |
|                                                | `fullName`             | `githubRepositoryFullNameSchema`                                                    |
|                                                | `private`              | `boolean`                                                                           |
|                                                | `defaultBranch`        | `string`, length ≥ 1                                                                |
|                                                | `archived`             | `boolean`                                                                           |
| `githubRepositoryPointerDtoSchema`             | `id`                   | `string`, length ≥ 1 (our row id)                                                   |
|                                                | `installationId`       | `string`, length ≥ 1 (our installation row id, not GitHub's number)                 |
|                                                | `externalId`           | GitHub id text (string)                                                             |
|                                                | `fullName`             | `githubRepositoryFullNameSchema`                                                    |
|                                                | `defaultBranch`        | `string`, length ≥ 1                                                                |
|                                                | `createdAt`            | `z.iso.datetime()` string                                                           |
| `trackRepositorySchema`                        | `installationId`       | `string`, length ≥ 1 (our installation row id)                                      |
|                                                | `externalId`           | GitHub id text (string)                                                             |

A repository pointer refers to a repository by its permanent GitHub id
(`externalId`). `fullName` is only the name last seen. Repositories can be
renamed and transferred, just as the `slug` of `organizationSummarySchema` is
renameable and never a foreign key.

**GitHub id text** is a string matching `^[1-9][0-9]*$` whose numeric value
is at most `Number.MAX_SAFE_INTEGER` (9007199254740991). When it fails, the
issue message is `Must be a positive whole number.` In
`trackRepositorySchema` and the DTOs it stays a string. In
`githubSetupCallbackSchema` it becomes a `number`.

**Full-name rule.** The value is exactly one `/` separating an owner and a
name. The owner is 1–39 characters of `[A-Za-z0-9-]` and does not start or
end with `-`. The name is 1–100 characters of `[A-Za-z0-9._-]` and is not `.`
or `..`. The value is not trimmed and its case is kept. When it fails, the
issue message is `Must be owner/name.`

### Existing exports keep their behaviour

Every export already in `index.ts` keeps its name, signature and behaviour:
`handleSchema`, the organization, membership, invitation and error schemas,
their constants and types, and everything re-exported from `build-info.js`,
`bounty.js`, `spec.js`, `jira.js` and `identicon.js`. No existing export is
renamed, widened or narrowed.

```gherkin
Feature: GitHub App installation and repository pointer wire contract
  The shared package exports the schemas that the API, the web app and the
  extension use to connect GitHub App installations and to track repositories
  by GitHub's permanent id.

  Background:
    Given every export below is imported from "packages/shared/src/index.ts"

  Rule: The vocabularies are closed and listed in a fixed order

    @happy
    Scenario: The constants list their values in order
      Then GITHUB_ACCOUNT_TYPES equals ["user", "organization"]
      And GITHUB_REPOSITORY_SELECTIONS equals ["all", "selected"]
      And GITHUB_SETUP_ACTIONS equals ["install", "update", "request"]

    @happy
    Scenario Outline: Each enum schema accepts its own values
      When <schema> parses "<value>"
      Then the parse succeeds with "<value>"

      Examples:
        | schema                          | value        |
        | githubAccountTypeSchema         | user         |
        | githubAccountTypeSchema         | organization |
        | githubRepositorySelectionSchema | all          |
        | githubRepositorySelectionSchema | selected     |
        | githubSetupActionSchema         | install      |
        | githubSetupActionSchema         | update       |
        | githubSetupActionSchema         | request      |

    @unhappy
    Scenario Outline: An enum schema refuses GitHub's casing and unknown values
      When <schema> safe-parses "<value>"
      Then the parse fails

      Examples:
        | schema                          | value        |
        | githubAccountTypeSchema         | User         |
        | githubAccountTypeSchema         | Organization |
        | githubAccountTypeSchema         | enterprise   |
        | githubRepositorySelectionSchema | none         |
        | githubSetupActionSchema         | uninstall    |

  Rule: A GitHub id in text is a canonical positive safe integer

    @happy
    Scenario Outline: A canonical id is accepted and kept as a string
      When trackRepositorySchema parses { installationId: "ghi_1", externalId: "<id>" }
      Then the parse succeeds
      And externalId is the string "<id>"

      Examples:
        | id               |
        | 1                |
        | 123456789        |
        | 9007199254740991 |

    @boundary
    Scenario: One past the largest safe integer is refused
      When trackRepositorySchema safe-parses { installationId: "ghi_1", externalId: "9007199254740992" }
      Then the parse fails with the message "Must be a positive whole number." at path ["externalId"]

    @unhappy
    Scenario Outline: A non-canonical id is refused rather than normalised
      When trackRepositorySchema safe-parses { installationId: "ghi_1", externalId: "<id>" }
      Then the parse fails with the message "Must be a positive whole number." at path ["externalId"]

      Examples:
        | id    |
        |       |
        | 0     |
        | 0123  |
        | -1    |
        | +1    |
        | 1.5   |
        | 1e3   |
        | " 12" |
        | abc   |

    @unhappy
    Scenario: A numeric externalId is refused, not coerced
      When trackRepositorySchema safe-parses { installationId: "ghi_1", externalId: 123 }
      Then the parse fails at path ["externalId"]

  Rule: A repository full name is owner/name under GitHub's character rules, case kept

    @happy
    Scenario Outline: A valid full name is returned unchanged
      When githubRepositoryFullNameSchema parses "<fullName>"
      Then the parse succeeds with "<fullName>"

      Examples:
        | fullName             |
        | octo-org/hello-world |
        | Octo/Hello.World     |
        | a/b                  |
        | o/repo_name-1.x      |
        | octo/.github         |

    @boundary
    Scenario Outline: The owner may be 39 characters and the name 100
      When githubRepositoryFullNameSchema safe-parses an owner of <ownerLength> "a"s, "/", and a name of <nameLength> "b"s
      Then the parse <outcome>

      Examples:
        | ownerLength | nameLength | outcome  |
        | 39          | 1          | succeeds |
        | 40          | 1          | fails    |
        | 1           | 100        | succeeds |
        | 1           | 101        | fails    |

    @unhappy
    Scenario Outline: A malformed full name is refused
      When githubRepositoryFullNameSchema safe-parses "<fullName>"
      Then the parse fails with the message "Must be owner/name."

      Examples:
        | fullName      |
        | octo          |
        | octo/         |
        | /repo         |
        | a/b/c         |
        | -octo/repo    |
        | octo-/repo    |
        | octo_org/repo |
        | octo/.        |
        | octo/..       |
        | octo/re po    |
        | " octo/repo"  |

  Rule: The setup callback needs an installation id unless the install was only requested

    @happy
    Scenario Outline: An install or update yields GitHub's installation id as a number
      When githubSetupCallbackSchema parses { installation_id: "42", setup_action: "<action>", state: "s1" }
      Then the result is { installationId: 42, setupAction: "<action>", state: "s1" }

      Examples:
        | action  |
        | install |
        | update  |

    @happy
    Scenario: A request without an installation id yields a null id
      # A member who is not an admin can only request the install; GitHub sends no id.
      When githubSetupCallbackSchema parses { setup_action: "request", state: "s1" }
      Then the result is { installationId: null, setupAction: "request", state: "s1" }

    @boundary
    Scenario: A request that does carry an id still yields a null id
      When githubSetupCallbackSchema parses { installation_id: "42", setup_action: "request", state: "s1" }
      Then the result is { installationId: null, setupAction: "request", state: "s1" }

    @unhappy
    Scenario Outline: An install or update without an id is refused
      When githubSetupCallbackSchema safe-parses { setup_action: "<action>", state: "s1" }
      Then the parse fails with the message "installation_id is required unless setup_action is request." at path ["installation_id"]

      Examples:
        | action  |
        | install |
        | update  |

    @unhappy
    Scenario Outline: A malformed callback is refused
      When githubSetupCallbackSchema safe-parses <query>
      Then the parse fails

      Examples:
        | query                                                         |
        | { installation_id: "42", setup_action: "install" }            |
        | { installation_id: "42", setup_action: "install", state: "" } |
        | { installation_id: "42", state: "s1" }                        |
        | { installation_id: "42", setup_action: "remove", state: "s1" }|
        | { installation_id: "0", setup_action: "install", state: "s1" }|
        | { installation_id: 42, setup_action: "install", state: "s1" } |

    @happy
    Scenario: Extra query parameters are dropped
      When githubSetupCallbackSchema parses { installation_id: "42", setup_action: "install", state: "s1", code: "abc" }
      Then the result is exactly { installationId: 42, setupAction: "install", state: "s1" }

  Rule: GitHub's payloads are parsed permissively and keep unknown fields

    @happy
    Scenario: An installation parses with nothing but its id
      When githubInstallationResponseSchema parses { id: 42 }
      Then the result's id is 42
      And account, repository_selection and suspended_at are undefined

    @happy
    Scenario: An installation with a null account, an unfamiliar selection and an unknown field parses
      When githubInstallationResponseSchema parses { id: 42, account: null, repository_selection: "some", suspended_at: null, somethingNew: true }
      Then account is null
      And repository_selection is "some"
      And suspended_at is null
      And somethingNew is true

    @unhappy
    Scenario Outline: An installation without a usable id is refused
      When githubInstallationResponseSchema safe-parses <payload>
      Then the parse fails

      Examples:
        | payload                     |
        | {}                          |
        | { id: "42" }                |
        | { id: 0 }                   |
        | { id: 1.5 }                 |
        | { id: 9007199254740992 }    |

    @happy
    Scenario: A repository parses with only its id and full name, keeping unknown fields
      When githubRepositoryResponseSchema parses { id: 7, full_name: "octo/hello", topics: ["x"] }
      Then id is 7 and full_name is "octo/hello"
      And private, default_branch and archived are undefined
      And topics is ["x"]

    @unhappy
    Scenario Outline: A repository without its id or full name is refused
      When githubRepositoryResponseSchema safe-parses <payload>
      Then the parse fails

      Examples:
        | payload                   |
        | { full_name: "octo/a" }   |
        | { id: 7 }                 |

    @boundary
    Scenario: An installation's repository page with no repositories parses as empty
      When githubInstallationRepositoriesResponseSchema parses {}
      Then repositories is []
      And total_count is undefined

    @happy
    Scenario: A repository page keeps its repositories in the order GitHub sent
      When githubInstallationRepositoriesResponseSchema parses { total_count: 2, repositories: [{ id: 2, full_name: "o/b" }, { id: 1, full_name: "o/a" }] }
      Then the repository ids are [2, 1]

  Rule: The DTOs we produce are strict: every field resolved, unknown keys stripped

    @happy
    Scenario: A complete installation DTO round-trips
      Given the installation DTO
        """
        { "id": "ghi_1", "installationId": 42, "accountLogin": "octo-org",
          "accountType": "organization", "repositorySelection": "selected",
          "suspended": false, "createdAt": "2026-11-01T00:00:00.000Z" }
        """
      When githubInstallationDtoSchema parses it
      Then the result deep-equals the input
      And githubInstallationListSchema parses { installations: [that DTO] } unchanged

    @unhappy
    Scenario Outline: An installation DTO missing or mistyping a field is refused
      When githubInstallationDtoSchema safe-parses the complete installation DTO with <change>
      Then the parse fails

      Examples:
        | change                              |
        | id removed                          |
        | installationId removed              |
        | accountLogin removed                |
        | accountType removed                 |
        | repositorySelection removed         |
        | suspended removed                   |
        | createdAt removed                   |
        | id set to ""                        |
        | accountLogin set to ""              |
        | installationId set to 0             |
        | installationId set to "42"          |
        | accountType set to "Organization"   |
        | repositorySelection set to "some"   |
        | suspended set to null               |
        | createdAt set to "2026-11-01"       |

    @happy
    Scenario: An unknown key on an installation DTO is stripped
      When githubInstallationDtoSchema parses the complete installation DTO plus { token: "secret" }
      Then the result has no token key

    @happy
    Scenario: A complete repository DTO round-trips
      Given the repository DTO { externalId: "7", fullName: "octo/hello", private: true, defaultBranch: "main", archived: false }
      When githubRepositoryDtoSchema parses it
      Then the result deep-equals the input
      And githubRepositoryListSchema parses { repositories: [that DTO] } unchanged

    @happy
    Scenario: A complete repository pointer DTO round-trips
      Given the pointer DTO { id: "ptr_1", installationId: "ghi_1", externalId: "7", fullName: "Octo/Hello", defaultBranch: "main", createdAt: "2026-11-01T00:00:00.000Z" }
      When githubRepositoryPointerDtoSchema parses it
      Then the result deep-equals the input
      And githubRepositoryPointerListSchema parses { pointers: [that DTO] } unchanged

    @unhappy
    Scenario Outline: A repository or pointer DTO with a bad field is refused
      When <schema> safe-parses its complete DTO with <change>
      Then the parse fails

      Examples:
        | schema                           | change                         |
        | githubRepositoryDtoSchema        | externalId set to 7            |
        | githubRepositoryDtoSchema        | fullName set to "hello"        |
        | githubRepositoryDtoSchema        | defaultBranch set to ""        |
        | githubRepositoryDtoSchema        | private removed                |
        | githubRepositoryDtoSchema        | archived removed               |
        | githubRepositoryPointerDtoSchema | installationId set to 42       |
        | githubRepositoryPointerDtoSchema | externalId set to "007"        |
        | githubRepositoryPointerDtoSchema | fullName set to "octo/a/b"     |
        | githubRepositoryPointerDtoSchema | defaultBranch removed          |
        | githubRepositoryPointerDtoSchema | createdAt set to "yesterday"   |

    @boundary
    Scenario Outline: Empty lists are valid
      When <schema> parses <value>
      Then the parse succeeds with <value>

      Examples:
        | schema                            | value                 |
        | githubInstallationListSchema      | { installations: [] } |
        | githubRepositoryListSchema        | { repositories: [] }  |
        | githubRepositoryPointerListSchema | { pointers: [] }      |

    @unhappy
    Scenario: A list without its array is refused
      When githubRepositoryPointerListSchema safe-parses {}
      Then the parse fails

  Rule: Tracking a repository names our installation row and GitHub's repository id

    @happy
    Scenario: A track body parses unchanged
      When trackRepositorySchema parses { installationId: "ghi_1", externalId: "7" }
      Then the result is { installationId: "ghi_1", externalId: "7" }

    @happy
    Scenario: Unknown keys in a track body are stripped
      # The full name is read from GitHub, never taken from the client.
      When trackRepositorySchema parses { installationId: "ghi_1", externalId: "7", fullName: "octo/hello" }
      Then the result is exactly { installationId: "ghi_1", externalId: "7" }

    @unhappy
    Scenario Outline: A track body without an installation is refused
      When trackRepositorySchema safe-parses <body>
      Then the parse fails at path ["installationId"]

      Examples:
        | body                                   |
        | { externalId: "7" }                    |
        | { installationId: "", externalId: "7" }|
        | { installationId: 1, externalId: "7" } |

  Rule: Existing exports are unchanged

    @happy
    Scenario: The organization and Jira contracts still parse as before
      When organizationSummarySchema parses { id: "org_1", name: "Acme", slug: "acme" }
      Then kind is "team"
      And registerBoardSchema still parses { connectionId: "c1", externalId: "10" } unchanged
      And handleSchema still parses "  FeverSoul  " to "feversoul"
```

Decided:

- What "repository pointer" means: a tracked reference to a repository, keyed by GitHub's permanent numeric id, with the full name last seen.
  Ticket: "feat(github): connect GitHub App installations and track repository pointers (#66)"
  Instead: a git ref pointer (a branch name mapped to a commit SHA) stored per repository.
- Which exports the change adds: schemas, constants and types only, with no mapping functions. GitHub-to-DTO mapping belongs to the integration package, as Jira's does.
  Ticket: silent.
  Instead: export pure mapping helpers such as `toGithubInstallationDto` from shared.
- Where the exports live: importable from `index.ts`, optionally through a `github.ts` that `index.ts` re-exports.
  Ticket: "The change keeps the exports' names and signatures."
  Instead: define everything inline in `index.ts`.
- Existing exports: unchanged in name, signature and behaviour.
  Ticket: "The change keeps the exports' names and signatures."
  Instead: rename or extend existing schemas (such as `registerBoardSchema`) to cover GitHub.
- How strict the GitHub response schemas are: `.loose()`. Only `id` (plus `full_name` on a repository) is required, and `repository_selection` and `account.type` are free strings.
  Ticket: silent.
  Instead: strict schemas with closed enums for GitHub's fields.
- The id type for GitHub ids sent by GitHub: a safe integer ≥ 1, and the string `"42"` is refused.
  Ticket: silent.
  Instead: `z.coerce.number()`, accepting numeric strings.
- The type of `externalId` in our DTOs and bodies: a canonical decimal string, not a number, matching Jira's `externalId`.
  Ticket: silent.
  Instead: a JSON number.
- Which id strings are accepted: `^[1-9][0-9]*$` up to `Number.MAX_SAFE_INTEGER`. Leading zeros, signs, whitespace, decimals and exponents are refused, with the message `Must be a positive whole number.`
  Ticket: silent.
  Instead: trim and normalise (`"0123"` becomes `"123"`), or allow any non-empty string as `registerBoardSchema` does.
- The full-name format: owner of 1–39 `[A-Za-z0-9-]` with no edge hyphens, and name of 1–100 `[A-Za-z0-9._-]` that is not `.` or `..`. Failures carry the message `Must be owner/name.`
  Ticket: silent.
  Instead: accept any string containing a single `/`.
- Full-name casing and whitespace: case is kept and nothing is trimmed, so surrounding whitespace is refused.
  Ticket: silent.
  Instead: lowercase and trim, as `handleSchema` does.
- Account type values: lowercase `user` and `organization`, and GitHub's `User` is refused in a DTO.
  Ticket: silent.
  Instead: keep GitHub's casing (`User` and `Organization`), or add `enterprise`.
- How the setup callback is shaped: snake_case input becomes camelCase output, and `installation_id` becomes a number.
  Ticket: silent.
  Instead: pass GitHub's query keys through unchanged.
- A setup callback without `installation_id`: refused for `install` and `update` with a fixed message at path `["installation_id"]`, and allowed for `request` with a null id.
  Ticket: silent.
  Instead: make `installation_id` required for every action.
- A `request` callback that carries an id: the id is ignored and the output is null.
  Ticket: silent.
  Instead: refuse it, or pass the id through.
- Whether the setup callback needs `state`: a non-empty string is required, since it is the CSRF guard the Jira flow also uses.
  Ticket: silent.
  Instead: make `state` optional.
- Unknown keys in DTOs, bodies and the callback: stripped, not refused.
  Ticket: silent.
  Instead: use `z.strictObject` to refuse them.
- Which installation the track body names: our installation row id as a string, not GitHub's numeric installation id.
  Ticket: silent.
  Instead: GitHub's `installation_id` number.
- Defaults and nullability in DTOs: none. Every field is required, and `defaultBranch` must be non-empty.
  Ticket: silent.
  Instead: a nullable `defaultBranch` for empty repositories, or defaults for backward compatibility.
- The key in the pointer list: `pointers`, kept apart from the reachable-repository list's `repositories`.
  Ticket: silent.
  Instead: `repositories` for both lists.
- List ordering: arrays keep their input order, and the schemas neither sort nor deduplicate.
  Ticket: silent.
  Instead: sort by full name or deduplicate by `externalId` during parsing.
- Concurrency: none applies. All exports are stateless schemas, so the spec has no `@concurrency` scenarios.
  Ticket: silent.
  Instead: specify idempotent tracking of the same repository twice, which belongs to the store, not this seam.
