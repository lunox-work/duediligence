# Jira wire contract and linear-time trailing-slash trimming in `@sandbox-factory/shared`

The Jira integration package was lost, and only its compiled output survived.
This change brings back its wire contract in `packages/shared`: the zod
schemas the API parses responses with and the client parses them back with,
for Jira connections, boards and issues. It also adds the one shared helper
that removes trailing slashes from a Jira site URL. The recovered code did
this with `siteUrl.replace(/\/+$/, "")` in `ApiTokenCredential` and in
`toIssueDto`. CodeQL flagged that regex as ReDoS (alerts 72 and 73): about
1300 ms for 60,000 slashes. The site URL is not ours. It comes from
Atlassian's accessible-resources response and from the stored
`jira_connection` row, so it is untrusted input. The helper scans backwards
in linear time and does not use a regex. `packages/client` already does the
same thing privately (`trimTrailingSlashes` in `packages/client/src/index.ts`).

Everything below is exported from `packages/shared/src/index.ts`. It may be
defined in a module that `index.ts` re-exports, the way `./build-info.js` is
re-exported. The new exports depend on `zod` only, like the rest of the file.

**New exports**

```ts
/** Removes every trailing "/" (U+002F) in one backwards scan. Never throws. */
export function trimTrailingSlashes(value: string): string;

/** An https Jira site URL. Trimmed of whitespace, validated, trailing slashes removed. */
export const jiraSiteUrlSchema: z.ZodType<string, string>;

export const JIRA_SITE_URL_MESSAGE =
  "A Jira site URL must be an https URL with no query or fragment.";

export const JIRA_AUTH_METHODS = ["oauth", "api_token"] as const;
export const jiraAuthMethodSchema: z.ZodEnum<...>;        // z.enum(JIRA_AUTH_METHODS)
export type JiraAuthMethod = (typeof JIRA_AUTH_METHODS)[number];

export const JIRA_STATUS_CATEGORIES = ["new", "indeterminate", "done"] as const;
export const jiraStatusCategorySchema: z.ZodEnum<...>;    // z.enum(JIRA_STATUS_CATEGORIES)
export type JiraStatusCategory = (typeof JIRA_STATUS_CATEGORIES)[number];

export const JIRA_ISSUE_KEY_MESSAGE = "A Jira issue key looks like PROJ-123.";

export const jiraConnectionSchema;      // z.object, see Rule "connection"
export const jiraConnectionListSchema;  // z.object({ connections: z.array(jiraConnectionSchema) })
export const connectJiraApiTokenSchema; // body for POST /api/v1/jira/connections
export const jiraBoardSchema;           // z.object, see Rule "board"
export const jiraBoardListSchema;       // z.object({ boards: z.array(jiraBoardSchema) })
export const jiraIssueSchema;           // z.object, see Rule "issue"
export const jiraIssueListSchema;       // z.object({ issues: z.array(jiraIssueSchema) })

export type JiraConnectionDto       = z.infer<typeof jiraConnectionSchema>;
export type JiraConnectionListDto   = z.infer<typeof jiraConnectionListSchema>;
export type ConnectJiraApiTokenInput = z.infer<typeof connectJiraApiTokenSchema>;
export type JiraBoardDto            = z.infer<typeof jiraBoardSchema>;
export type JiraBoardListDto        = z.infer<typeof jiraBoardListSchema>;
export type JiraIssueDto            = z.infer<typeof jiraIssueSchema>;
export type JiraIssueListDto        = z.infer<typeof jiraIssueListSchema>;
```

The object shapes:

| Schema                      | Field            | Rule                                                              |
| --------------------------- | ---------------- | ----------------------------------------------------------------- |
| `jiraConnectionSchema`      | `id`             | `z.string().min(1)` (a `jrc_…` id; prefix not checked)            |
|                             | `siteUrl`        | `jiraSiteUrlSchema`                                               |
|                             | `siteName`       | `z.string().min(1)`                                               |
|                             | `authMethod`     | `jiraAuthMethodSchema`                                            |
|                             | `createdAt`      | `z.iso.datetime()`                                                |
| `connectJiraApiTokenSchema` | `siteUrl`        | `jiraSiteUrlSchema`                                               |
|                             | `email`          | `z.email()`                                                       |
|                             | `apiToken`       | `z.string().trim().min(1, "Provide the API token.")`              |
| `jiraBoardSchema`           | `id`             | `z.string().min(1)` (a `jrb_…` id; prefix not checked)            |
|                             | `connectionId`   | `z.string().min(1)`                                               |
|                             | `name`           | `z.string().min(1)`                                               |
| `jiraIssueSchema`           | `id`             | `z.string().min(1)` (a `jri_…` id; prefix not checked)            |
|                             | `boardId`        | `z.string().min(1)`                                               |
|                             | `key`            | matches `/^[A-Z][A-Z0-9_]*-[0-9]+$/`, else `JIRA_ISSUE_KEY_MESSAGE` |
|                             | `summary`        | `z.string().min(1)`                                               |
|                             | `status`         | `z.string().min(1)` (the workflow's own status name)              |
|                             | `statusCategory` | `jiraStatusCategorySchema`                                        |
|                             | `assignee`       | `z.string().nullable()` (display name, `null` when unassigned)    |
|                             | `url`            | `z.url()`                                                         |
|                             | `updatedAt`      | `z.iso.datetime()`                                                |

Every field is required. All objects use zod's default (strip) mode, so
unknown keys are dropped from the output.

**Existing exports keep their names, signatures and behaviour.** These are
`titleSchema`, `todoFilterSchema`, `handleSchema`, `todoSchema`,
`todoListSchema`, `createTodoSchema`, `updateTodoSchema`,
`ORGANIZATION_ROLES`, `organizationRoleSchema`, `organizationSummarySchema`,
`membershipSchema`, `membershipListSchema`, `organizationMemberSchema`,
`organizationMemberListSchema`, `pendingInvitationSchema`,
`pendingInvitationListSchema`, `inviteMemberSchema`, `errorSchema`, every
exported `*Dto` / `*Input` / `OrganizationRole` type, and everything
re-exported from `./build-info.js`. The tests in
`packages/shared/test/schemas.test.ts`, `build-info.test.ts`,
`build-info-resolver.test.ts` and `next-version.test.ts` pass unchanged.

```gherkin
Feature: Jira wire contract and linear-time trailing-slash trimming

  Background:
    Given a valid connection is
      | field      | value                       |
      | id         | jrc_1                       |
      | siteUrl    | https://acme.atlassian.net  |
      | siteName   | Acme                        |
      | authMethod | oauth                       |
      | createdAt  | 2026-09-16T00:00:00.000Z    |
    And a valid issue is
      | field          | value                                       |
      | id             | jri_1                                       |
      | boardId        | jrb_1                                       |
      | key            | PROJ-123                                    |
      | summary        | Fix the login redirect                      |
      | status         | In Review                                   |
      | statusCategory | indeterminate                               |
      | assignee       | Dana                                        |
      | url            | https://acme.atlassian.net/browse/PROJ-123  |
      | updatedAt      | 2026-09-17T09:14:00.000Z                    |

  Rule: trimTrailingSlashes removes only the run of "/" at the very end, and nothing else

    @happy
    Scenario: Trailing slashes are removed and everything before them is kept
      When trimTrailingSlashes is called with each input
      Then it returns the matching output
        | input                            | output                       |
        | https://acme.atlassian.net/      | https://acme.atlassian.net   |
        | https://acme.atlassian.net///    | https://acme.atlassian.net   |
        | https://jira.example.com/jira/   | https://jira.example.com/jira |
        | a/b/c//                          | a/b/c                        |

    @boundary
    Scenario: Strings with no trailing slash come back unchanged
      When trimTrailingSlashes is called with each input
      Then it returns the input unchanged
        | input                         |
        | https://acme.atlassian.net    |
        | a//b                          |
        | /leading                      |
        | x                             |

    @boundary
    Scenario: Empty and all-slash strings trim to the empty string
      When trimTrailingSlashes is called with each input
      Then it returns the matching output
        | input | output |
        |       |        |
        | /     |        |
        | ///// |        |

    @boundary
    Scenario: Only U+002F counts as a slash; backslashes and whitespace are kept
      When trimTrailingSlashes is called with each input
      Then it returns the matching output
        | input                               | output                              |
        | https://acme.atlassian.net\\        | https://acme.atlassian.net\\        |
        | https://acme.atlassian.net/ (space) | https://acme.atlassian.net/ (space) |
        | https://acme.atlassian.net/\t       | https://acme.atlassian.net/\t       |
      # "(space)" stands for one trailing U+0020; "\t" for one trailing U+0009.
      # A slash followed by whitespace is not a trailing slash.

    @boundary
    Scenario: A long run of slashes is handled in linear time
      When trimTrailingSlashes is called with each input
      Then it returns the matching output within 250 ms of wall time per call
        | input                                                     | output                                                    |
        | "https://acme.atlassian.net" + 60,000 × "/"               | https://acme.atlassian.net                                |
        | 60,000 × "/"                                              | (empty string)                                            |
        | "https://acme.atlassian.net" + 60,000 × "/" + "x"         | the input unchanged                                       |
        | 1,000,000 × "/"                                           | (empty string)                                            |
      # The old `replace(/\/+$/, "")` took about 1300 ms on the 60,000 case.

  Rule: jiraSiteUrlSchema trims whitespace, accepts only an https URL with no query or fragment, and outputs it without trailing slashes

    @happy
    Scenario: Valid site URLs parse to their slash-free form
      When jiraSiteUrlSchema parses each input
      Then the parse succeeds with the matching output
        | input                              | output                           |
        | https://acme.atlassian.net         | https://acme.atlassian.net       |
        | https://acme.atlassian.net/        | https://acme.atlassian.net       |
        | https://acme.atlassian.net////     | https://acme.atlassian.net       |
        | https://jira.example.com/jira/     | https://jira.example.com/jira    |
        | "  https://acme.atlassian.net/  "  | https://acme.atlassian.net       |

    @boundary
    Scenario: The output is the trimmed input, not a re-serialised URL
      When jiraSiteUrlSchema parses "https://Acme.Atlassian.net/"
      Then the parse succeeds with "https://Acme.Atlassian.net"
      # Host casing, ports and paths are kept as written; no URL.href normalisation.

    @boundary
    Scenario: A site URL ending in 60,000 slashes parses quickly
      When jiraSiteUrlSchema parses "https://acme.atlassian.net" followed by 60,000 "/"
      Then the parse succeeds with "https://acme.atlassian.net"
      And the parse takes under 250 ms of wall time
      # No length cap: such a URL is accepted, not refused.

    @unhappy
    Scenario: Anything but an https URL without query or fragment is refused with one message
      When jiraSiteUrlSchema safe-parses each input
      Then success is false
      And the first issue's message is JIRA_SITE_URL_MESSAGE
        | input                                  | why                    |
        | (empty string)                         | empty                  |
        | "   "                                  | whitespace only        |
        | acme.atlassian.net                     | no scheme              |
        | not a url                              | not a URL              |
        | http://acme.atlassian.net              | not https              |
        | ftp://acme.atlassian.net               | not https              |
        | https://acme.atlassian.net/?x=1        | has a query            |
        | https://acme.atlassian.net/?           | has an empty query     |
        | https://acme.atlassian.net/#top        | has a fragment         |
        | https://acme.atlassian.net/#           | has an empty fragment  |

    @unhappy
    Scenario: A non-string is refused
      When jiraSiteUrlSchema safe-parses each of 42, null, undefined
      Then success is false for each

  Rule: jiraConnectionSchema accepts a connection, normalises its siteUrl, and drops anything else

    @happy
    Scenario: A well-formed connection parses to itself
      When jiraConnectionSchema parses the valid connection
      Then the result deep-equals the valid connection

    @happy
    Scenario: Both auth methods are accepted
      When jiraConnectionSchema parses the valid connection with authMethod set to each value
      Then the parse succeeds
        | authMethod |
        | oauth      |
        | api_token  |

    @happy
    Scenario: A stored siteUrl with trailing slashes is normalised on the way out
      When jiraConnectionSchema parses the valid connection with siteUrl "https://acme.atlassian.net///"
      Then the result's siteUrl is "https://acme.atlassian.net"

    @boundary
    Scenario: A secret that leaks into a connection row is not serialised
      When jiraConnectionSchema parses the valid connection plus apiToken "secret-token" and email "dana@example.test"
      Then the result deep-equals the valid connection
      And the result has no apiToken key and no email key

    @unhappy
    Scenario: Malformed connections are refused
      When jiraConnectionSchema safe-parses the valid connection with one field changed
      Then success is false
        | field      | value                      |
        | id         | (empty string)             |
        | siteUrl    | http://acme.atlassian.net  |
        | siteName   | (empty string)             |
        | authMethod | basic                      |
        | createdAt  | yesterday                  |
        | createdAt  | 2026-09-16T00:00:00+02:00  |
        | id         | (missing)                  |

    @happy
    Scenario: jiraConnectionListSchema wraps connections under "connections"
      When jiraConnectionListSchema parses { connections: [the valid connection] }
      Then the result deep-equals { connections: [the valid connection] }
      And parsing { connections: [] } returns { connections: [] }

    @unhappy
    Scenario: jiraConnectionListSchema refuses a list with one bad entry
      When jiraConnectionListSchema safe-parses { connections: [the valid connection, { ...valid connection, siteUrl: "nope" }] }
      Then success is false

  Rule: connectJiraApiTokenSchema takes a site URL, an account email and a non-blank token

    @happy
    Scenario: A well-formed body parses with the site URL normalised and the token trimmed
      When connectJiraApiTokenSchema parses
        | field    | value                          |
        | siteUrl  | https://acme.atlassian.net/    |
        | email    | dana@example.test              |
        | apiToken | "  ATATT3xFfGF0abc  "          |
      Then the result deep-equals
        | field    | value                       |
        | siteUrl  | https://acme.atlassian.net  |
        | email    | dana@example.test           |
        | apiToken | ATATT3xFfGF0abc             |

    @unhappy
    Scenario: A blank token is refused with its own message
      When connectJiraApiTokenSchema safe-parses the body above with apiToken set to each value
      Then success is false
      And the first issue's message is "Provide the API token."
        | apiToken       |
        | (empty string) |
        | "    "         |

    @unhappy
    Scenario: Other malformed bodies are refused
      When connectJiraApiTokenSchema safe-parses the body above with one field changed
      Then success is false
        | field    | value                      |
        | siteUrl  | http://acme.atlassian.net  |
        | email    | not-an-email               |
        | email    | " dana@example.test "      |
        | email    | (missing)                  |
        | apiToken | (missing)                  |
        | siteUrl  | (missing)                  |

  Rule: jiraBoardSchema accepts a board belonging to a connection

    @happy
    Scenario: A well-formed board parses to itself, inside and outside its list
      When jiraBoardSchema parses { id: "jrb_1", connectionId: "jrc_1", name: "Platform" }
      Then the result deep-equals the input
      And jiraBoardListSchema parses { boards: [that board] } to { boards: [that board] }

    @unhappy
    Scenario: Malformed boards are refused
      When jiraBoardSchema safe-parses that board with one field changed
      Then success is false
        | field        | value          |
        | id           | (empty string) |
        | connectionId | (empty string) |
        | name         | (empty string) |
        | name         | (missing)      |

  Rule: jiraIssueSchema accepts an issue whose key is PROJECT-NUMBER and whose status category is one of Jira's three

    @happy
    Scenario: A well-formed issue parses to itself
      When jiraIssueSchema parses the valid issue
      Then the result deep-equals the valid issue

    @happy
    Scenario: An unassigned issue carries a null assignee
      When jiraIssueSchema parses the valid issue with assignee null
      Then the result's assignee is null

    @happy
    Scenario: Each status category is accepted
      When jiraIssueSchema parses the valid issue with statusCategory set to each value
      Then the parse succeeds
        | statusCategory |
        | new            |
        | indeterminate  |
        | done           |

    @boundary
    Scenario: Issue keys at the edges of the pattern are accepted
      When jiraIssueSchema parses the valid issue with key set to each value
      Then the parse succeeds with that key unchanged
        | key           |
        | A-1           |
        | PROJ-0        |
        | AB_2-99999    |
        | P2P-7         |

    @unhappy
    Scenario: Keys that do not look like PROJ-123 are refused with the key message
      When jiraIssueSchema safe-parses the valid issue with key set to each value
      Then success is false
      And the first issue's message is JIRA_ISSUE_KEY_MESSAGE
        | key            | why                          |
        | proj-123       | lowercase project            |
        | PROJ123        | no hyphen                    |
        | PROJ-          | no number                    |
        | -123           | no project                   |
        | 2PROJ-1        | project starts with a digit  |
        | PROJ-12a       | number has a letter          |
        | " PROJ-123"    | surrounding whitespace       |
        | PROJ-1-2       | two hyphens                  |
        | (empty string) | empty                        |

    @unhappy
    Scenario: Other malformed issues are refused
      When jiraIssueSchema safe-parses the valid issue with one field changed
      Then success is false
        | field          | value                      |
        | id             | (empty string)             |
        | boardId        | (empty string)             |
        | summary        | (empty string)             |
        | status         | (empty string)             |
        | statusCategory | undefined                  |
        | statusCategory | Done                       |
        | assignee       | (missing)                  |
        | url            | not a url                  |
        | updatedAt      | yesterday                  |

    @boundary
    Scenario: Unknown issue fields are dropped
      When jiraIssueSchema parses the valid issue plus fields { priority: "High" }
      Then the result deep-equals the valid issue

    @happy
    Scenario: jiraIssueListSchema wraps issues under "issues"
      When jiraIssueListSchema parses { issues: [the valid issue] }
      Then the result deep-equals { issues: [the valid issue] }

  Rule: The existing contract is unchanged

    @happy
    Scenario: Existing schemas behave as before
      When todoSchema parses { id: "todo_1", title: "write tests", done: false, createdAt: "2026-09-16T00:00:00.000Z" }
      Then the result deep-equals the input
      And handleSchema parses "  FeverSoul  " to "feversoul"
      And buildInfoSchema and UNKNOWN_BUILD are still exported from the package index
```

Decided:

- The helper is named `trimTrailingSlashes(value: string): string` and is exported from the shared package.
  Ticket: "Replaced with a backwards scan in one shared helper"
  Instead: the name `stripTrailingSlashes` (the commit title's verb), or keeping the helper internal to the Jira package.
- Only U+002F counts as a slash. Backslashes and trailing whitespace are kept, and `""` and all-slash strings return `""`.
  Ticket: "strip trailing slashes without a backtracking regex"
  Instead: also stripping backslashes or trailing whitespace.
- The linear-time requirement is pinned at under 250 ms for 60,000 slashes (also tested at 1,000,000), including the case where non-slash text follows the slashes.
  Ticket: "pinned by a test that fails on the old implementation (1300ms against a 250ms threshold)"
  Instead: an operation-count bound, or a timing test only on the trailing-slash case.
- Site URLs have no length cap, so a URL ending in 60,000 slashes is accepted and normalised.
  Ticket: silent.
  Instead: capping the length (e.g. 2048 characters) and refusing longer input.
- Site URLs must be `https`. A URL containing `?` or `#` anywhere is refused, even when the query or fragment is empty. Every refusal uses `JIRA_SITE_URL_MESSAGE`.
  Ticket: "`siteUrl` is not ours: it comes from Atlassian's accessible-resources response and from the stored `jira_connection` row."
  Instead: accepting any URL `z.url()` accepts, or different messages per failure.
- Leading and trailing whitespace is trimmed from a site URL before validation, following `titleSchema`.
  Ticket: silent.
  Instead: refusing any surrounding whitespace.
- The parsed site URL is the trimmed input string. It is not `new URL(...).href`, so casing and paths are kept as written.
  Ticket: silent.
  Instead: normalising through the WHATWG URL serializer (lowercase host, default port removed).
- `jiraSiteUrlSchema` also normalises on the way out, so a stored row with trailing slashes serialises without them.
  Ticket: "Replaced with a backwards scan in one shared helper"
  Instead: validate-only on output, with trimming left to `ApiTokenCredential` and `toIssueDto`.
- The connection, board and issue fields and the list wrappers (`connections`, `boards`, `issues`) are as in the table above.
  Ticket: "recover the Jira integration package and its wire contract"
  Instead: richer shapes (cloud id, project key on boards, priority and issue type on issues).
- Ids are `z.string().min(1)` without a prefix check, following the existing schemas, even though the db uses `jrc_`/`jrb_`/`jri_`.
  Ticket: silent.
  Instead: enforcing the prefix with a regex such as `/^jrc_/`.
- Unknown keys are stripped (zod's default), so a leaked `apiToken` or `email` never reaches the wire.
  Ticket: silent.
  Instead: `z.strictObject`, which refuses unknown keys.
- `authMethod` is one of `oauth` or `api_token`.
  Ticket: silent.
  Instead: a free-form string, or only the method the ticket names (`ApiTokenCredential`).
- The API-token connect body is `{ siteUrl, email, apiToken }`. The token is trimmed and must not be blank (`"Provide the API token."`). `email` is `z.email()` and is not trimmed, matching `inviteMemberSchema`.
  Ticket: silent.
  Instead: trimming the email, or not exporting a request body schema from shared.
- Issue keys must match `/^[A-Z][A-Z0-9_]*-[0-9]+$/` (uppercase only, no trimming, number `0` allowed) and use `JIRA_ISSUE_KEY_MESSAGE`.
  Ticket: silent.
  Instead: any non-empty string, or uppercasing the key before checking.
- `statusCategory` is limited to Jira's `new`, `indeterminate` and `done`, and Jira's `undefined` category is refused. `status` is free text.
  Ticket: silent.
  Instead: also accepting `undefined`, or omitting the category.
- `assignee` is a display name, or `null` when the issue is unassigned. The key is required, not optional.
  Ticket: silent.
  Instead: an optional field, or an object with an account id.
- Timestamps use `z.iso.datetime()`, which accepts `Z` only and no offsets, the same as `todoSchema.createdAt`.
  Ticket: silent.
  Instead: `z.iso.datetime({ offset: true })`.
- There are no `@concurrency` scenarios. Every export is a pure function or a stateless schema, so overlapping calls cannot interact.
  Ticket: silent.
  Instead: a scenario that runs parallel parses and checks they are independent.
- Every existing export keeps its name, signature and behaviour. The change only adds exports.
  Ticket: "The change keeps the exports' names and signatures."
  Instead: renaming or folding existing exports into a Jira namespace.
