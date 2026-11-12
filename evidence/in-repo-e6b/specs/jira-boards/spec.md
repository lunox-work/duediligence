# Jira board store: register boards and the selection a run reads them by

Ticket #33 lets an organization register boards from its Jira connections, and
store for each board the *selection* a run uses to choose its oldest backlog
tickets. This spec covers the storage half in `packages/db`. That means a new
`jira_board` table, and a new `JiraBoardStore` in `packages/db/src/jira-boards.ts`
that follows `createJiraConnectionStore`. Every method takes the organization id
first and puts it in the `WHERE` clause. Another organization's board is a miss
(`null` / `false`), never an error that confirms the id exists. The store does
not query Jira. `forRun` gives the runner what it needs to do that: the board,
its selection, and the connection's `cloudId` and `siteUrl`.

## Exports

### `packages/db/src/jira-boards.ts` (new)

These come from the ticket's interface without change:

```ts
export interface StoredBoardSelection {
  readonly maxTickets?: number;
  readonly excludeAssigned?: boolean;
  readonly issueTypes?: readonly string[];
  readonly minAgeDays?: number;
  readonly maxAgeDays?: number | null;
  readonly minSpecChars?: number;
}

export interface JiraBoardSummary {
  readonly id: string;
  readonly connectionId: string;
  readonly externalId: string;
  readonly name: string;
  readonly boardType: string;
  readonly projectKey: string | null;
  readonly selection: StoredBoardSelection;
  readonly writebackEnabled: boolean;
  readonly createdAt: string;
}

export interface RegisterBoardInput {
  readonly connectionId: string;
  readonly externalId: string;
  readonly name: string;
  readonly boardType: string;
  readonly projectKey?: string | null;
  readonly selection?: StoredBoardSelection;
}

export interface UpdateBoardInput {
  readonly selection?: StoredBoardSelection;
  readonly writebackEnabled?: boolean;
}

export interface JiraBoardStore {
  list(organizationId: string): Promise<JiraBoardSummary[]>;
  get(organizationId: string, boardId: string): Promise<JiraBoardSummary | null>;
  register(organizationId: string, input: RegisterBoardInput): Promise<JiraBoardSummary>;
  update(organizationId: string, boardId: string, input: UpdateBoardInput): Promise<JiraBoardSummary | null>;
  remove(organizationId: string, boardId: string): Promise<boolean>;
  forRun(organizationId: string, boardId: string): Promise<{
    board: JiraBoardSummary;
    connectionId: string;
    cloudId: string;
    siteUrl: string;
  } | null>;
}

export function createJiraBoardStore(db: Database): JiraBoardStore;
```

`Database` is the type from `./store.js`.

This spec adds these exports to the same file:

```ts
/** The most tickets one run may take from a board. */
export const BOARD_MAX_TICKETS_LIMIT = 100;

/** Which input field failed validation. */
export type InvalidJiraBoardField =
  | "externalId"
  | "name"
  | "maxTickets"
  | "excludeAssigned"
  | "issueTypes"
  | "minAgeDays"
  | "maxAgeDays"
  | "minSpecChars"
  | "writebackEnabled";

/** Thrown by register/update/normalizeBoardSelection before any database call. */
export class InvalidJiraBoardError extends Error {
  readonly field: InvalidJiraBoardField;
  constructor(field: InvalidJiraBoardField, message: string);
  // name === "InvalidJiraBoardError"
}

/** Thrown by register when the connection is missing or belongs to another organization. */
export class JiraConnectionNotFoundError extends Error {
  constructor(connectionId: string);
  // name === "JiraConnectionNotFoundError"
  // message === `No Jira connection with id "${connectionId}".`
}

/** Validates and normalizes a selection; pure. Throws InvalidJiraBoardError. */
export function normalizeBoardSelection(
  selection: StoredBoardSelection,
): StoredBoardSelection;
```

### `packages/db/src/schema/jira.ts` and `packages/db/src/schema.ts`

The new table is declared in `schema/jira.ts`, beside `jiraConnection`.
`schema.ts` stays a barrel and re-exports it:

```ts
export { jiraBoard, jiraConnection } from "./schema/jira.js";
export type {
  JiraBoardRow,        // typeof jiraBoard.$inferSelect
  JiraConnectionRow,
  NewJiraBoardRow,     // typeof jiraBoard.$inferInsert
  NewJiraConnectionRow,
} from "./schema/jira.js";
```

`jiraBoard` is `pgTable("jira_board", …)` with these columns:

| property           | column              | type                                  | null     | default    | reference                                   |
| ------------------ | ------------------- | ------------------------------------- | -------- | ---------- | ------------------------------------------- |
| `id`               | `id`                | text, primary key                     | not null |            |                                             |
| `organizationId`   | `organization_id`   | text                                  | not null |            | `organization.id`, `onDelete: "cascade"`    |
| `connectionId`     | `connection_id`     | text                                  | not null |            | `jira_connection.id`, `onDelete: "cascade"` |
| `externalId`       | `external_id`       | text                                  | not null |            |                                             |
| `name`             | `name`              | text                                  | not null |            |                                             |
| `boardType`        | `board_type`        | text                                  | not null |            |                                             |
| `projectKey`       | `project_key`       | text                                  | nullable |            |                                             |
| `selection`        | `selection`         | jsonb, `$type<StoredBoardSelection>()` | not null | `{}`       |                                             |
| `writebackEnabled` | `writeback_enabled` | boolean                               | not null | `false`    |                                             |
| `createdAt`        | `created_at`        | timestamptz                           | not null | now        |                                             |
| `updatedAt`        | `updated_at`        | timestamptz                           | not null | now        |                                             |

The table also has:

- the unique constraint `jira_board_connection_external_unique` on
  `(connection_id, external_id)`
- the index `jira_board_organization_id_idx` on `(organization_id)`

`schema/jira.ts` gets `StoredBoardSelection` through `import type` from
`../jira-boards.js`. The type is erased at build time, so no runtime import
cycle appears. The SQL migration comes from `npm run db:generate`, and this spec
does not test it.

`packages/db/src/index.ts` re-exports `createJiraBoardStore`,
`normalizeBoardSelection`, `BOARD_MAX_TICKETS_LIMIT`, `InvalidJiraBoardError`,
`JiraConnectionNotFoundError`, the six types above and `InvalidJiraBoardField`.
That file is outside the coverage gate and is not tested here.

### Unchanged

These keep their current behaviour:

- every export of `jira-connections.ts`
- `jiraConnection`, `JiraConnectionRow` and `NewJiraConnectionRow`
- every other table and row type in `schema.ts`
- `generateId` and `ID_PREFIXES`, which already contain `"jrb"`

### Rows the store reads (for the database fake)

- `list`, `get`, `update` and `remove` resolve to `JiraBoardRow[]`.
- `register` makes two calls:
  1. An owner-scoped `select` on `jira_connection`. Only whether a row comes
     back matters.
  2. An `insert … onConflictDoUpdate … returning()` that resolves to
     `JiraBoardRow[]`.
- `forRun` issues one `select({ board: jiraBoard, cloudId: jiraConnection.cloudId, siteUrl: jiraConnection.siteUrl })`
  `.from(jiraBoard).innerJoin(jiraConnection, eq(jiraBoard.connectionId, jiraConnection.id))`
  with a `where`. It resolves to `{ board: JiraBoardRow; cloudId: string; siteUrl: string }[]`.

```gherkin
Feature: Jira board store

  Background:
    Given a board row "B1":
      | field            | value                                           |
      | id               | jrb_1                                           |
      | organizationId   | org_1                                           |
      | connectionId     | jrc_1                                           |
      | externalId       | 42                                              |
      | name             | Platform                                        |
      | boardType        | scrum                                           |
      | projectKey       | PLAT                                            |
      | selection        | {"maxTickets":5,"issueTypes":["Bug"]}           |
      | writebackEnabled | false                                           |
      | createdAt        | 2026-10-01T00:00:00.000Z                        |
      | updatedAt        | 2026-10-01T00:00:00.000Z                        |
    And a store made by createJiraBoardStore over a database fake that resolves every query to the rows given in each scenario and records each call's kind, values and whether a where was applied

  Rule: A summary is the row mapped field by field, with createdAt as an ISO string and no organizationId or updatedAt

    @happy
    Scenario: get maps a stored row to a summary
      Given the database holds row "B1"
      When get("org_1", "jrb_1") is called
      Then it resolves to:
        | field            | value                                 |
        | id               | jrb_1                                 |
        | connectionId     | jrc_1                                 |
        | externalId       | 42                                    |
        | name             | Platform                              |
        | boardType        | scrum                                 |
        | projectKey       | PLAT                                  |
        | selection        | {"maxTickets":5,"issueTypes":["Bug"]} |
        | writebackEnabled | false                                 |
        | createdAt        | 2026-10-01T00:00:00.000Z              |
      And the summary has exactly these nine keys

    @boundary
    Scenario: a null project key stays null
      Given the database holds row "B1" with projectKey null
      When get("org_1", "jrb_1") is called
      Then the summary's projectKey is null

  Rule: A stored selection is read leniently: only the six known keys survive, and only when each passes its own rule; anything else reads as absent, never as an error

    @boundary
    Scenario Outline: the selection column is sanitized on read
      Given the database holds row "B1" with selection <stored>
      When get("org_1", "jrb_1") is called
      Then the summary's selection deep-equals <read>

      Examples:
        | stored                                                   | read                               |
        | {}                                                       | {}                                 |
        | null                                                     | {}                                 |
        | []                                                       | {}                                 |
        | "text"                                                   | {}                                 |
        | {"maxTickets":5,"colour":"red"}                          | {"maxTickets":5}                   |
        | {"maxTickets":0}                                         | {}                                 |
        | {"maxTickets":101}                                       | {}                                 |
        | {"minAgeDays":1.5,"minSpecChars":200}                    | {"minSpecChars":200}               |
        | {"maxAgeDays":null}                                      | {"maxAgeDays":null}                |
        | {"excludeAssigned":"yes"}                                | {}                                 |
        | {"issueTypes":["Bug",""]}                                | {}                                 |
        | {"issueTypes":"Bug"}                                     | {}                                 |
        | {"minAgeDays":30,"maxAgeDays":7}                         | {"minAgeDays":30,"maxAgeDays":7}   |

  Rule: list returns the organization's boards newest createdAt first, ties broken by id ascending, sorted in the store whatever order the database returns

    @happy
    Scenario: list is owner-scoped and newest first
      Given the database returns, in this order:
        | id    | createdAt                |
        | jrb_a | 2026-10-01T00:00:00.000Z |
        | jrb_c | 2026-10-03T00:00:00.000Z |
        | jrb_b | 2026-10-02T00:00:00.000Z |
      When list("org_1") is called
      Then the summary ids are, in order: jrb_c, jrb_b, jrb_a
      And the first call is a select with a where applied

    @boundary
    Scenario: equal timestamps fall back to id order
      Given the database returns, in this order:
        | id    | createdAt                |
        | jrb_z | 2026-10-01T00:00:00.000Z |
        | jrb_m | 2026-10-01T00:00:00.000Z |
      When list("org_1") is called
      Then the summary ids are, in order: jrb_m, jrb_z

    @boundary
    Scenario: an organization with no boards lists none
      Given the database returns no rows
      When list("org_1") is called
      Then it resolves to []

  Rule: get filters on both the organization and the board id; a miss, including another organization's board, is null

    @happy
    Scenario: get is owner-scoped
      Given the database holds row "B1"
      When get("org_1", "jrb_1") is called
      Then the first call is a select with a where applied

    @unhappy
    Scenario: another organization's board is null
      Given the database returns no rows
      When get("org_2", "jrb_1") is called
      Then it resolves to null

  Rule: normalizeBoardSelection validates each key and returns a new object with only the keys given, normalized; keys whose value is undefined and unknown keys are dropped

    @happy
    Scenario: a full valid selection passes through
      When normalizeBoardSelection is called with {"maxTickets":10,"excludeAssigned":true,"issueTypes":["Bug","Task"],"minAgeDays":14,"maxAgeDays":365,"minSpecChars":200}
      Then it returns {"maxTickets":10,"excludeAssigned":true,"issueTypes":["Bug","Task"],"minAgeDays":14,"maxAgeDays":365,"minSpecChars":200}

    @boundary
    Scenario Outline: accepted values and their normal form
      When normalizeBoardSelection is called with <input>
      Then it returns <output>

      Examples:
        | input                                         | output                         |
        | {}                                            | {}                             |
        | {"maxTickets":1}                              | {"maxTickets":1}               |
        | {"maxTickets":100}                            | {"maxTickets":100}             |
        | {"minAgeDays":0,"minSpecChars":0}             | {"minAgeDays":0,"minSpecChars":0} |
        | {"maxAgeDays":0}                              | {"maxAgeDays":0}               |
        | {"maxAgeDays":null}                           | {"maxAgeDays":null}            |
        | {"minAgeDays":7,"maxAgeDays":7}               | {"minAgeDays":7,"maxAgeDays":7} |
        | {"excludeAssigned":false}                     | {"excludeAssigned":false}      |
        | {"issueTypes":[" Bug ","Task","Bug"]}         | {"issueTypes":["Bug","Task"]}  |
        | {"issueTypes":["bug","Bug"]}                  | {"issueTypes":["bug","Bug"]}   |
        | {"issueTypes":[]}                             | {}                             |
        | {"maxTickets":undefined,"minAgeDays":3}       | {"minAgeDays":3}               |
        | {"minAgeDays":3,"colour":"red"}               | {"minAgeDays":3}               |

    @unhappy
    Scenario Outline: a rejected value throws InvalidJiraBoardError naming the field
      When normalizeBoardSelection is called with <input>
      Then it throws InvalidJiraBoardError with field "<field>" and message "<message>"

      Examples:
        | input                               | field           | message                                                     |
        | {"maxTickets":0}                    | maxTickets      | maxTickets must be a whole number from 1 to 100.            |
        | {"maxTickets":101}                  | maxTickets      | maxTickets must be a whole number from 1 to 100.            |
        | {"maxTickets":2.5}                  | maxTickets      | maxTickets must be a whole number from 1 to 100.            |
        | {"maxTickets":NaN}                  | maxTickets      | maxTickets must be a whole number from 1 to 100.            |
        | {"excludeAssigned":"yes"}           | excludeAssigned | excludeAssigned must be true or false.                      |
        | {"issueTypes":["Bug","  "]}         | issueTypes      | issueTypes must be a list of non-empty names.               |
        | {"issueTypes":"Bug"}                | issueTypes      | issueTypes must be a list of non-empty names.               |
        | {"minAgeDays":-1}                   | minAgeDays      | minAgeDays must be a whole number of days, 0 or more.       |
        | {"minAgeDays":Infinity}             | minAgeDays      | minAgeDays must be a whole number of days, 0 or more.       |
        | {"maxAgeDays":-1}                   | maxAgeDays      | maxAgeDays must be null or a whole number of days, 0 or more. |
        | {"maxAgeDays":1.5}                  | maxAgeDays      | maxAgeDays must be null or a whole number of days, 0 or more. |
        | {"minAgeDays":30,"maxAgeDays":7}    | maxAgeDays      | maxAgeDays cannot be less than minAgeDays.                  |
        | {"minSpecChars":-5}                 | minSpecChars    | minSpecChars must be a whole number, 0 or more.             |

    @unhappy
    Scenario: the first failing key in interface order is the one reported
      When normalizeBoardSelection is called with {"minSpecChars":-1,"maxTickets":0}
      Then it throws InvalidJiraBoardError with field "maxTickets"

    @boundary
    Scenario: the input is not mutated
      Given a selection object {"issueTypes":[" Bug "]}
      When normalizeBoardSelection is called with it
      Then the original object still holds issueTypes [" Bug "]

  Rule: register validates and normalizes input before any database call; externalId and name are trimmed and must be non-empty, boardType is trimmed with empty meaning "unknown", projectKey is trimmed with absent or empty meaning null

    @happy
    Scenario: register writes a prefixed, owner-scoped row with write-back off
      Given the database holds row "B1"
      When register("org_1", {connectionId: "jrc_1", externalId: " 42 ", name: " Platform ", boardType: "scrum", projectKey: "PLAT", selection: {maxTickets: 5}}) is called
      Then the first call is a select with a where applied
      And the second call is an insert whose values have:
        | field            | value             |
        | id               | matches ^jrb_     |
        | organizationId   | org_1             |
        | connectionId     | jrc_1             |
        | externalId       | 42                |
        | name             | Platform          |
        | boardType        | scrum             |
        | projectKey       | PLAT              |
        | selection        | {"maxTickets":5}  |
        | writebackEnabled | false             |
      And it resolves to the summary of row "B1"

    @boundary
    Scenario Outline: optional and blank fields take their defaults
      Given the database holds row "B1"
      When register is called for "org_1" with connectionId "jrc_1", externalId "42", name "Platform", boardType <boardType>, projectKey <projectKey> and selection <selection>
      Then the insert values have boardType <storedType>, projectKey <storedKey> and selection <storedSelection>

      Examples:
        | boardType | projectKey | selection | storedType | storedKey | storedSelection |
        | "kanban"  | (absent)   | (absent)  | "kanban"   | null      | {}              |
        | "  "      | null       | {}        | "unknown"  | null      | {}              |
        | "scrum"   | "  "       | (absent)  | "scrum"    | null      | {}              |
        | "scrum"   | " PLAT "   | {"issueTypes":[]} | "scrum" | "PLAT" | {}           |

    @unhappy
    Scenario Outline: a blank external id or name is rejected before the database is touched
      When register("org_1", {connectionId: "jrc_1", externalId: <externalId>, name: <name>, boardType: "scrum"}) is called
      Then it rejects with InvalidJiraBoardError with field "<field>" and message "<message>"
      And no database call was made

      Examples:
        | externalId | name       | field      | message                     |
        | ""         | "Platform" | externalId | A board needs its Jira id.  |
        | "   "      | "Platform" | externalId | A board needs its Jira id.  |
        | "42"       | ""         | name       | A board needs a name.       |
        | "42"       | " \t "     | name       | A board needs a name.       |

    @unhappy
    Scenario: an invalid selection is rejected before the database is touched
      When register("org_1", {connectionId: "jrc_1", externalId: "42", name: "Platform", boardType: "scrum", selection: {maxTickets: 0}}) is called
      Then it rejects with InvalidJiraBoardError with field "maxTickets"
      And no database call was made

  Rule: register only attaches a board to a connection the organization owns; otherwise it rejects with JiraConnectionNotFoundError and writes nothing

    @unhappy
    Scenario: another organization's connection is refused
      Given the database returns no rows
      When register("org_2", {connectionId: "jrc_1", externalId: "42", name: "Platform", boardType: "scrum"}) is called
      Then it rejects with JiraConnectionNotFoundError whose message is 'No Jira connection with id "jrc_1".'
      And exactly one call was made, a select with a where applied
      And no insert was made

  Rule: registering the same Jira board on the same connection again updates the existing row in place (conflict on connection_id, external_id); name, boardType and projectKey are refreshed, selection only when given, writebackEnabled and id and createdAt never

    @happy
    Scenario: re-registering refreshes Jira's details and keeps the board's id
      Given the database holds a connection, and the upsert returns row "B1" with name "Platform v2"
      When register("org_1", {connectionId: "jrc_1", externalId: "42", name: "Platform v2", boardType: "scrum"}) is called
      Then the insert targets a conflict on (connectionId, externalId)
      And the conflict update sets name "Platform v2", boardType "scrum", projectKey null and updatedAt to a Date
      And the conflict update sets neither selection, writebackEnabled, id, organizationId nor createdAt
      And it resolves to a summary with id "jrb_1" and name "Platform v2"

    @boundary
    Scenario: a re-registration that gives a selection replaces it
      When register("org_1", {connectionId: "jrc_1", externalId: "42", name: "Platform", boardType: "scrum", selection: {minAgeDays: 30}}) is called against an existing board
      Then the conflict update sets selection {"minAgeDays":30}

  Rule: register fails loudly when the upsert returns no row, and passes database errors through unchanged

    @unhappy
    Scenario: an upsert that returns no row rejects
      Given the connection select returns a row and the upsert returns no rows
      When register("org_1", {connectionId: "jrc_1", externalId: "42", name: "Platform", boardType: "scrum"}) is called
      Then it rejects with an Error whose message is "Failed to record the Jira board."

  Rule: update validates first, then issues one owner-scoped UPDATE returning the row; selection replaces the stored selection whole; a miss is null

    @happy
    Scenario: update replaces the selection and toggles write-back
      Given the database holds row "B1" with writebackEnabled true and selection {"minAgeDays":30}
      When update("org_1", "jrb_1", {selection: {minAgeDays: 30}, writebackEnabled: true}) is called
      Then exactly one call was made, an update with a where applied
      And its values have selection {"minAgeDays":30}, writebackEnabled true and updatedAt a Date
      And it resolves to a summary with writebackEnabled true and selection {"minAgeDays":30}

    @boundary
    Scenario Outline: only the fields given are written
      Given the database holds row "B1"
      When update("org_1", "jrb_1", <input>) is called
      Then the update values hold exactly the keys <keys>

      Examples:
        | input                         | keys                                      |
        | {writebackEnabled: false}     | writebackEnabled, updatedAt               |
        | {selection: {maxTickets: 3}}  | selection, updatedAt                      |
        | {selection: {}}               | selection, updatedAt                      |
        | {selection: undefined, writebackEnabled: true} | writebackEnabled, updatedAt |

    @boundary
    Scenario: an empty selection clears the stored one
      Given the database holds row "B1"
      When update("org_1", "jrb_1", {selection: {}}) is called
      Then the update values have selection {}

    @boundary
    Scenario: an empty update reads instead of writing
      Given the database holds row "B1"
      When update("org_1", "jrb_1", {}) is called
      Then exactly one call was made, a select with a where applied
      And it resolves to the summary of row "B1"

    @unhappy
    Scenario Outline: a miss is null, whether written or read
      Given the database returns no rows
      When update("org_2", "jrb_1", <input>) is called
      Then it resolves to null

      Examples:
        | input                     |
        | {writebackEnabled: true}  |
        | {}                        |

    @unhappy
    Scenario Outline: invalid input is rejected before the database is touched, even for a board that does not exist
      Given the database returns no rows
      When update("org_1", "jrb_1", <input>) is called
      Then it rejects with InvalidJiraBoardError with field "<field>"
      And no database call was made

      Examples:
        | input                                          | field            |
        | {selection: {minAgeDays: 30, maxAgeDays: 7}}   | maxAgeDays       |
        | {writebackEnabled: "yes"} (cast)               | writebackEnabled |

    @unhappy
    Scenario: a non-boolean writebackEnabled names the field and says so
      When update("org_1", "jrb_1", {writebackEnabled: 1} cast to UpdateBoardInput) is called
      Then it rejects with InvalidJiraBoardError whose message is "writebackEnabled must be true or false."

  Rule: update never reads before it writes, so a board removed by an overlapping call makes update return null instead of bringing the board back

    @concurrency
    Scenario: update overlapping a remove
      Given the database returns no rows for the update because a remove of "jrb_1" committed first
      When update("org_1", "jrb_1", {writebackEnabled: true}) and remove("org_1", "jrb_1") are started together
      Then update resolves to null
      And update made exactly one call, an update, and no insert

  Rule: overlapping registrations of one Jira board rely on the conflict target, not on a read, so both resolve to the one row the database returns

    @concurrency
    Scenario: two registrations of board 42 at once
      Given the database's upsert returns row "B1" to each statement
      When register("org_1", {connectionId: "jrc_1", externalId: "42", name: "Platform", boardType: "scrum"}) is started twice without awaiting the first
      Then each call made one connection select followed by one insert with a conflict target, and no select on jira_board
      And both resolve to a summary with id "jrb_1"

  Rule: remove deletes with both predicates and reports whether a row went

    @happy
    Scenario: removing an owned board
      Given the database holds row "B1"
      When remove("org_1", "jrb_1") is called
      Then it resolves to true
      And the first call is a delete with a where applied

    @unhappy
    Scenario: removing another organization's board
      Given the database returns no rows
      When remove("org_2", "jrb_1") is called
      Then it resolves to false

  Rule: forRun reads the board and its connection in one owner-scoped query and returns the board summary with the connection's id, cloudId and siteUrl; a miss is null; connection health is not checked here

    @happy
    Scenario: forRun returns what a run needs
      Given the joined query returns [{board: row "B1", cloudId: "cloud-1", siteUrl: "https://acme.atlassian.net"}]
      When forRun("org_1", "jrb_1") is called
      Then exactly one call was made, a select with a where applied
      And it resolves to:
        | field        | value                         |
        | board        | the summary of row "B1"       |
        | connectionId | jrc_1                         |
        | cloudId      | cloud-1                       |
        | siteUrl      | https://acme.atlassian.net    |
      And the result carries no token material and no keys other than these four

    @boundary
    Scenario: forRun sanitizes the selection the same way get does
      Given the joined query returns row "B1" with selection {"maxTickets":500,"minAgeDays":14}
      When forRun("org_1", "jrb_1") is called
      Then the board's selection is {"minAgeDays":14}

    @unhappy
    Scenario: forRun for a board the caller does not own is null
      Given the joined query returns no rows
      When forRun("org_2", "jrb_1") is called
      Then it resolves to null

  Rule: the jira_board table is owned by an organization, hangs off a connection, and is unique per Jira board per connection

    @happy
    Scenario: the barrel exports the table
      Then schema.ts exports jiraBoard, and it is the same object schema/jira.ts exports
      And getTableConfig(jiraBoard).name is "jira_board"

    @happy
    Scenario: columns, nullability and defaults
      Then getTableConfig(jiraBoard) has these columns:
        | column            | notNull | default |
        | id                | true    |         |
        | organization_id   | true    |         |
        | connection_id     | true    |         |
        | external_id       | true    |         |
        | name              | true    |         |
        | board_type        | true    |         |
        | project_key       | false   |         |
        | selection         | true    | {}      |
        | writeback_enabled | true    | false   |
        | created_at        | true    | defaultNow() (hasDefault true) |
        | updated_at        | true    | defaultNow() (hasDefault true) |

    @happy
    Scenario: both owners cascade
      Then jiraBoard has a foreign key to organization with onDelete "cascade"
      And jiraBoard has a foreign key to jiraConnection with onDelete "cascade"

    @happy
    Scenario: one row per Jira board per connection, indexed for its owner
      Then jiraBoard has a unique constraint "jira_board_connection_external_unique" on columns connection_id, external_id
      And jiraBoard has an index "jira_board_organization_id_idx" whose first column is organization_id
```

## Notes for the implementer

- Validation order for `register` is externalId, then name, then the selection.
  Selection keys go in interface order (`maxTickets`, `excludeAssigned`,
  `issueTypes`, `minAgeDays`, `maxAgeDays`, `minSpecChars`), followed by the
  `maxAgeDays ≥ minAgeDays` check. For `update` the order is the selection, then
  `writebackEnabled`. The first failure is the one thrown.
- An integer here means `Number.isSafeInteger`. `NaN`, `±Infinity` and
  fractions fail. The cross-field check runs only when both `minAgeDays` and
  `maxAgeDays` are numbers.
- `issueTypes`: each entry is trimmed. Exact duplicates after trimming are
  dropped, and the first occurrence keeps its position. Matching is
  case-sensitive. An empty list after normalizing means the key is omitted.
- Read-time sanitizing applies the same per-key rules without throwing. It
  skips the cross-field check, and it drops an invalid `issueTypes` whole rather
  than filtering it. A stored `issueTypes` is still trimmed and de-duplicated.
- Sort in JavaScript, not only in SQL. The test fake does not interpret
  `orderBy`, which is the same reason `organizations.ts` sorts in JavaScript.

Decided:
- What happens when a board is registered against a connection the organization does not own.
    Ticket: silent.
    Instead: insert anyway and rely on the foreign key, or return null.
- What error type a missing connection raises, and its message.
    Ticket: silent.
    Instead: a plain `Error`, or reusing `NotFoundError` from `store.ts`.
- Registering the same Jira board twice updates it in place on (connection_id, external_id).
    Ticket: silent.
    Instead: reject the second registration as a conflict.
- On re-registration, selection changes only when given; writeback, id and createdAt are kept.
    Ticket: silent.
    Instead: overwrite every field with the new input.
- New boards start with write-back off.
    Ticket: silent.
    Instead: default write-back on when the connection has `write:jira-work`.
- Enabling write-back does not check the connection's scopes in the store.
    Ticket: silent.
    Instead: reject `writebackEnabled: true` when the scopes lack `write:jira-work`.
- `update`'s selection replaces the stored selection whole.
    Ticket: silent.
    Instead: merge the given keys into the stored selection.
- An empty update reads the board instead of writing, as `TodoStore.update` does.
    Ticket: silent.
    Instead: reject an empty update as invalid input.
- Which selection values are rejected, and the limit of 1–100 for `maxTickets`.
    Ticket: silent.
    Instead: accept any positive number with no cap, and leave validation to the HTTP edge.
- `maxAgeDays` below `minAgeDays` is rejected; equal is allowed.
    Ticket: silent.
    Instead: accept it and let the run select nothing.
- `maxAgeDays: null` is kept as null, distinct from an absent key.
    Ticket: "readonly maxAgeDays?: number | null;"
    Instead: collapse null to absent.
- An empty `issueTypes` list means no restriction and is stored as absent; entries are trimmed and de-duplicated case-sensitively.
    Ticket: silent.
    Instead: store `[]` as given, meaning no type matches.
- Unknown selection keys are dropped on write and on read.
    Ticket: silent.
    Instead: reject unknown keys.
- A stored selection that fails validation is sanitized on read rather than thrown.
    Ticket: silent.
    Instead: throw on read so the bad row is noticed.
- A summary's selection holds only the stored keys and does not fill in defaults.
    Ticket: "readonly selection: StoredBoardSelection;"
    Instead: fill in default values for every key.
- Input string normalization: trim externalId and name and reject them when empty; a blank boardType becomes "unknown"; a blank projectKey becomes null.
    Ticket: silent.
    Instead: store the strings exactly as given.
- No length cap on name, externalId or boardType.
    Ticket: silent.
    Instead: cap at 255 characters to match Jira's limit.
- Errors are thrown by type (`InvalidJiraBoardError` with a `field`) before any database call.
    Ticket: silent.
    Instead: return a result union, or throw `RangeError`.
- `list` order is newest createdAt first, ties broken by id ascending, sorted in the store.
    Ticket: silent.
    Instead: oldest first, as `organizations.ts` lists memberships.
- `forRun` returns the board even when its connection is unhealthy.
    Ticket: silent.
    Instead: return null for an unhealthy connection.
- `forRun` is one joined query with the row shape `{ board, cloudId, siteUrl }`.
    Ticket: silent.
    Instead: two queries, first the board and then `jira_connection`.
- Deleting a connection or an organization cascades to its boards.
    Ticket: silent.
    Instead: `onDelete: "restrict"`, so a connection with boards cannot be removed.
- A board is unique per connection, not per organization.
    Ticket: silent.
    Instead: unique on (organization_id, external_id).
- The table lives in `schema/jira.ts` and is re-exported by the `schema.ts` barrel; `index.ts` re-exports the new store.
    Ticket: silent.
    Instead: declare the table directly in `schema.ts`.
- What happens when overlapping calls race: update never reads first, and register relies on the conflict target.
    Ticket: silent.
    Instead: read-then-write inside a transaction.
