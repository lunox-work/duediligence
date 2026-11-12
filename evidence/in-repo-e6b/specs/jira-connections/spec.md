# Store Jira connections with encrypted tokens (#29)

An organization connects one or more Atlassian sites. Each connection is a row
in a new `jira_connection` table (the table `packages/jira/src/credentials.ts`
already names as the `TokenSource` backing store), owned by an organization and
holding the OAuth access/refresh pair. The tokens are bearer credentials, so
they are never stored in plaintext: a new `TokenCipher` (AES-256-GCM, in
`packages/db/src/cipher.ts`) encrypts them on the way in and decrypts them on
the way out, and a new `JiraConnectionStore` (`packages/db/src/jira-connections.ts`)
is the only code that reads or writes the table. Listing a connection never
decrypts anything; only `tokens()` does.

## Exports

### `packages/db/src/cipher.ts` (new)

```ts
export class TokenCipherError extends Error {
    constructor(message: string);
}

export interface TokenCipher {
    encrypt(plaintext: string | null): string | null;
    decrypt(ciphertext: string | null): string | null;
    readonly keyId: string;
}

export function createTokenCipher(key: string, options: {
    keyId?: string;
} = {}): TokenCipher;

export function sameKeyId(left: string, right: string): boolean;
```

- `TokenCipherError` sets `this.name = "TokenCipherError"` and keeps the message
  it is given, as `JiraCredentialError` and `NotFoundError` do. It is the only
  error type `cipher.ts` throws.
- **Key.** `key` is 32 random bytes in standard base64 (`+` and `/`), which is
  what `openssl rand -base64 32` prints. Leading and trailing whitespace is
  trimmed first. The trailing `=` is optional. After trimming, the key must be
  exactly 43 characters from `[A-Za-z0-9+/]`, optionally followed by one `=`.
  Any other key, including base64url (`-`, `_`), hex, the empty string, and
  base64 of 31 or 33 bytes, makes `createTokenCipher` throw
  `TokenCipherError("Token cipher key must be 32 bytes, base64-encoded.")`.
- **Key id.** `options.keyId` must match `^[A-Za-z0-9_-]{1,64}$`. Otherwise
  `createTokenCipher` throws
  `TokenCipherError('Token cipher key id must be 1-64 characters of A-Z, a-z, 0-9, "_" or "-".')`.
  The key is checked before the key id. If `keyId` is omitted (or
  `undefined`), it defaults to the first 8 lowercase hex characters of the
  SHA-256 of the 32 decoded key bytes. So a different key gets a different
  default id.
- **Ciphertext format.** `v1:<keyId>:<iv>:<tag>:<data>` is five fields joined
  by `:`. `iv` is a fresh random 12-byte nonce for every call. `tag` is the
  16-byte GCM authentication tag. `data` is the AES-256-GCM encryption of the
  UTF-8 bytes of the plaintext. `iv`, `tag` and `data` are base64url without
  padding, so `iv` is 16 characters, `tag` is 22 characters, and `data` is
  empty for an empty plaintext. The additional authenticated data is the UTF-8
  bytes of `v1:<keyId>`, which ties the recorded key id to the ciphertext.
- `encrypt(null)` returns `null`. `decrypt(null)` returns `null`. Plaintext has
  no length limit, and `""` is a valid plaintext.
- `decrypt` runs its checks in this order and throws at the first one that
  fails:
  1. **Format.** There are exactly five fields. The first is `v1`. The second
     matches the key-id pattern. The remaining three use only `[A-Za-z0-9_-]`.
     `iv` decodes to 12 bytes and `tag` decodes to 16 bytes. If any of this
     fails, it throws `TokenCipherError("Ciphertext is not in the v1 format.")`.
  2. **Key id.** If `sameKeyId(<recorded id>, cipher.keyId)` is false, it
     throws `TokenCipherError('Ciphertext was encrypted with key "<recorded id>", not "<cipher.keyId>".')`.
  3. **Authentication.** If GCM verification fails, it throws
     `TokenCipherError("Ciphertext failed authentication: wrong key or tampered data.")`.
  No message contains the key or the plaintext.
- `sameKeyId(left, right)` is `true` exactly when both strings match the
  key-id pattern and are identical, compared case-sensitively. It is `false`
  otherwise, including `sameKeyId("", "")`.
- A cipher keeps no mutable state. Calls on one cipher do not affect each
  other.

### `packages/db/src/schema/jira.ts` (new)

```ts
export const jiraConnection = pgTable("jira_connection", { … }, (table) => [ … ]);
export type JiraConnectionRow = typeof jiraConnection.$inferSelect;
export type NewJiraConnectionRow = typeof jiraConnection.$inferInsert;
```

| Property       | Column          | Type                            | Null     | Default            |
|----------------|-----------------|---------------------------------|----------|--------------------|
| `id`           | `id`            | `text`, primary key             | not null | —                  |
| `organizationId` | `organization_id` | `text` → `organization.id`, `on delete cascade` | not null | — |
| `cloudId`      | `cloud_id`      | `text`                          | not null | —                  |
| `siteUrl`      | `site_url`      | `text`                          | not null | —                  |
| `siteName`     | `site_name`     | `text`                          | not null | —                  |
| `email`        | `email`         | `text`                          | nullable | —                  |
| `accessToken`  | `access_token`  | `text` (ciphertext only)        | nullable | —                  |
| `refreshToken` | `refresh_token` | `text` (ciphertext only)        | nullable | —                  |
| `expiresAt`    | `expires_at`    | `timestamp with time zone`      | nullable | —                  |
| `scopes`       | `scopes`        | `text[]`                        | not null | `'{}'::text[]`     |
| `healthy`      | `healthy`       | `boolean`                       | not null | `true`             |
| `createdAt`    | `created_at`    | `timestamp with time zone`      | not null | `now()`            |
| `updatedAt`    | `updated_at`    | `timestamp with time zone`      | not null | `now()`            |

- The table has one unique constraint, `jira_connection_organization_cloud_unique`,
  on (`organization_id`, `cloud_id`). This means one connection per site per
  organization. Because `organization_id` leads, the constraint also serves the
  `list` query, so the table has no other index.
- The module imports `organization` from `./organizations.js` and uses it only
  inside the foreign-key thunk. `organizations.ts` does not import it back.

### `packages/db/src/schema.ts` (changed)

- The barrel also re-exports `jiraConnection`, the type `JiraConnectionRow` and
  the type `NewJiraConnectionRow` from `./schema/jira.js`.
- Its header comment lists `schema/jira.ts` among the modules.
- Every existing export keeps its value and behaviour.
- `authSchema` (`auth-schema.ts`) is unchanged and does not include
  `jiraConnection`.
- `src/index.ts` and `ID_PREFIXES` are unchanged. `"jrc"` is already declared
  there.
- The SQL migration is generated with `drizzle-kit generate` from this table.
  This spec does not cover it.

### `packages/db/src/jira-connections.ts` (new)

The interfaces `JiraConnectionSummary`, `JiraConnectionTokens`,
`JiraConnectionInput` and `JiraConnectionStore`, plus
`createJiraConnectionStore(db: Database, cipher: TokenCipher): JiraConnectionStore`,
are exactly as the ticket gives them. `Database` is the type from `./store.js`.

**Mapping a row to a `JiraConnectionSummary`:**

- `id`, `cloudId`, `siteUrl`, `siteName`, `email`, `healthy` and `scopes` are
  copied from the row.
- `createdAt` is `row.createdAt.toISOString()`.
- The object has exactly these eight keys. It has no `organizationId`, no
  tokens, no `expiresAt` and no `updatedAt`.

**Mapping a row to `JiraConnectionTokens`:**

- `accessToken` is `cipher.decrypt(row.accessToken)` and `refreshToken` is
  `cipher.decrypt(row.refreshToken)`.
- `expiresAt` is `row.expiresAt?.toISOString() ?? null`.
- `scopes` is `row.scopes`.
- The object has exactly these four keys.

**Input checks (`upsert`, and `saveTokens` for `expiresAt`):**

These run before any query is issued. When a check fails, the method rejects
and touches the database not at all. Checks run in this order:

1. `cloudId`, then `siteUrl`, then `siteName` must contain at least one
   non-whitespace character. Otherwise the method rejects with
   `RangeError("<field> must not be empty.")`.
2. `expiresAt` is `null` or a string that matches
   `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$`, where
   `new Date(expiresAt)` is a valid date. Otherwise the method rejects with
   `RangeError('expiresAt must be an ISO 8601 timestamp with an offset, got "<value>".')`.
   A valid value is stored as `new Date(expiresAt)`. That means fractions are
   truncated to milliseconds and out-of-range calendar days roll over as
   `Date` does.

Strings that pass the checks are stored exactly as given, with no trimming or
case folding. `email` that is omitted or `undefined` is stored as `null`.
`scopes` is stored in the given order, and duplicates are kept. Tokens are
passed through `cipher.encrypt` and only the result is written.

**Query shapes.** The store issues only the Drizzle calls below, one per
method call. Tests can therefore use an in-memory fake in the style of
`test/fake-organization-db.ts`. `select()` with no projection resolves to
`JiraConnectionRow` objects.

| Method          | Call                                                                                                                                                                  | Result used                          |
|-----------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------|
| `list`          | `db.select().from(jiraConnection).where(eq(jiraConnection.organizationId, organizationId))`                                                                           | all rows                             |
| `get`, `tokens` | `db.select().from(jiraConnection).where(and(eq(jiraConnection.organizationId, organizationId), eq(jiraConnection.id, connectionId))).limit(1)`                         | first row, or none                   |
| `upsert`        | `db.insert(jiraConnection).values(values).onConflictDoUpdate({ target: [jiraConnection.organizationId, jiraConnection.cloudId], set }).returning()`                    | first row                            |
| `saveTokens`    | `db.update(jiraConnection).set(set).where(eq(jiraConnection.id, connectionId))`                                                                                       | nothing                              |
| `markUnhealthy` | `db.update(jiraConnection).set({ healthy: false, updatedAt: sql\`now()\` }).where(eq(jiraConnection.id, connectionId))`                                                 | nothing                              |
| `remove`        | `db.delete(jiraConnection).where(and(eq(jiraConnection.organizationId, organizationId), eq(jiraConnection.id, connectionId))).returning({ id: jiraConnection.id })`     | number of rows                       |

- `upsert` `values` has these properties: `id: generateId("jrc")`,
  `organizationId`, `cloudId`, `siteUrl`, `siteName`, `email`, `accessToken`
  (ciphertext or `null`), `refreshToken` (ciphertext or `null`), `expiresAt`
  (`Date` or `null`), `scopes` and `healthy: true`. It has no `createdAt` and
  no `updatedAt`.
- The `upsert` `set` is the same object without `id`, `organizationId` and
  `cloudId`, plus `updatedAt: sql\`now()\``.
- The `saveTokens` `set` has exactly these properties: `accessToken`,
  `refreshToken`, `expiresAt` (all converted as above), `scopes`,
  `healthy: true` and `updatedAt: sql\`now()\``.
- No method reads the clock. `updatedAt` is always the SQL `now()`.
- `list` sorts in JavaScript, because the fakes do not interpret `orderBy`.
  The order is `createdAt` ascending, and rows with the same `createdAt` are
  ordered by `id` ascending (code-unit order).
- If `upsert`'s `returning()` resolves to no row, `upsert` rejects with
  `Error("Upsert returned no row.")`.

```gherkin
Feature: Jira connections with encrypted tokens

  Background:
    Given K1 is "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=" (bytes 0..31), whose default key id is "630dcd29"
    And K2 is "ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=" (bytes 32..63), whose default key id is "72dbb733"
    And "cipher" is createTokenCipher(K1)
    And "fake" is an in-memory Database that answers the query shapes above over a list of JiraConnectionRow
    And "store" is createJiraConnectionStore(fake, cipher)

  Rule: createTokenCipher accepts only a 32-byte standard-base64 key and a well-formed key id

    @happy
    Scenario Outline: An accepted key yields its default key id
      When createTokenCipher is called with key <key> and no options
      Then it returns a cipher whose keyId is "<keyId>"

      Examples:
        | key                                                  | keyId    |
        | "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="       | 630dcd29 |
        | "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"        | 630dcd29 |
        | "  AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=\n"   | 630dcd29 |
        | "ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8="       | 72dbb733 |

    @unhappy
    Scenario Outline: A rejected key throws TokenCipherError
      When createTokenCipher is called with key <key>
      Then it throws a TokenCipherError named "TokenCipherError" with message "Token cipher key must be 32 bytes, base64-encoded."

      Examples:
        | key                                                                   | why                     |
        | ""                                                                    | empty                   |
        | "   "                                                                 | whitespace only         |
        | "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHg=="                        | 31 bytes                |
        | "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8g"                        | 33 bytes                |
        | "___________________________________________8"                        | base64url alphabet      |
        | "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"    | hex                     |
        | "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=="                       | extra padding           |

    @happy
    Scenario: An explicit key id replaces the default
      When createTokenCipher(K1, { keyId: "2026-11_a" }) is called
      Then the cipher's keyId is "2026-11_a"

    @boundary
    Scenario Outline: Key id length and alphabet limits
      When createTokenCipher(K1, { keyId: <keyId> }) is called
      Then <outcome>

      Examples:
        | keyId                | outcome                                                                                                              |
        | "a"                  | the cipher's keyId is "a"                                                                                            |
        | 64 × "k"             | the cipher's keyId is the 64-character id                                                                            |
        | 65 × "k"             | it throws TokenCipherError 'Token cipher key id must be 1-64 characters of A-Z, a-z, 0-9, "_" or "-".'               |
        | ""                   | it throws TokenCipherError 'Token cipher key id must be 1-64 characters of A-Z, a-z, 0-9, "_" or "-".'               |
        | "k:1"                | it throws TokenCipherError 'Token cipher key id must be 1-64 characters of A-Z, a-z, 0-9, "_" or "-".'               |
        | "k 1"                | it throws TokenCipherError 'Token cipher key id must be 1-64 characters of A-Z, a-z, 0-9, "_" or "-".'               |
        | undefined            | the cipher's keyId is "630dcd29"                                                                                     |

    @unhappy
    Scenario: The key is checked before the key id
      When createTokenCipher("", { keyId: "" }) is called
      Then it throws TokenCipherError "Token cipher key must be 32 bytes, base64-encoded."

  Rule: encrypt produces a fresh v1 ciphertext that decrypt turns back into the plaintext

    @happy
    Scenario Outline: Round trip
      When cipher.decrypt(cipher.encrypt(<plaintext>)) is called
      Then it returns <plaintext>

      Examples:
        | plaintext                     |
        | "eyJhbGciOiJIUzI1NiJ9.access" |
        | "tökén 🔑"                    |
        | ""                            |
        | 100000 × "x"                  |

    @happy
    Scenario: The ciphertext has the documented layout
      When cipher.encrypt("secret") is called
      Then the result split on ":" has 5 fields
      And field 1 is "v1" and field 2 is "630dcd29"
      And field 3 is 16 base64url characters that decode to 12 bytes
      And field 4 is 22 base64url characters that decode to 16 bytes
      And field 5 is non-empty base64url without "="
      And the result does not contain "secret"

    @boundary
    Scenario: The empty plaintext has an empty data field
      When cipher.encrypt("") is called
      Then the result ends with ":" and its fifth field is ""

    @happy
    Scenario: Encrypting the same plaintext twice gives different ciphertexts
      When cipher.encrypt("secret") is called twice
      Then the two results differ
      And both decrypt to "secret"

    @happy
    Scenario: A ciphertext is readable by another cipher built from the same key and key id
      Given "other" is createTokenCipher(" AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8 ")
      When other.decrypt(cipher.encrypt("secret")) is called
      Then it returns "secret"

    @boundary
    Scenario: null passes through both directions
      Then cipher.encrypt(null) returns null
      And cipher.decrypt(null) returns null

  Rule: decrypt rejects malformed, foreign-key and tampered ciphertexts with TokenCipherError

    @unhappy
    Scenario Outline: A malformed ciphertext
      When cipher.decrypt(<ciphertext>) is called
      Then it throws TokenCipherError "Ciphertext is not in the v1 format."

      Examples:
        | ciphertext                                                  | why                         |
        | ""                                                          | empty string, not null      |
        | "plaintext-token"                                           | one field                   |
        | a valid ciphertext with field 1 changed to "v2"             | unknown version             |
        | a valid ciphertext with a sixth field ":x" appended         | six fields                  |
        | a valid ciphertext with field 2 changed to ""               | invalid key id              |
        | a valid ciphertext with field 3 cut to 15 characters        | iv not 12 bytes             |
        | a valid ciphertext with field 4 cut to 21 characters        | tag not 16 bytes            |
        | a valid ciphertext with "=" appended to field 5             | padding / foreign alphabet  |
        | a valid ciphertext with field 5 containing "+"              | standard base64, not url    |

    @unhappy
    Scenario: A ciphertext recorded under another key id
      Given "k2" is createTokenCipher(K2)
      When cipher.decrypt(k2.encrypt("secret")) is called
      Then it throws TokenCipherError 'Ciphertext was encrypted with key "72dbb733", not "630dcd29".'

    @unhappy
    Scenario: The same key id over a different key fails authentication
      Given "a" is createTokenCipher(K1, { keyId: "prod" }) and "b" is createTokenCipher(K2, { keyId: "prod" })
      When b.decrypt(a.encrypt("secret")) is called
      Then it throws TokenCipherError "Ciphertext failed authentication: wrong key or tampered data."

    @unhappy
    Scenario: Relabelling the key id is detected
      Given "a" is createTokenCipher(K1, { keyId: "old" }) and "b" is createTokenCipher(K1, { keyId: "new" })
      And c is a.encrypt("secret") with field 2 replaced by "new"
      When b.decrypt(c) is called
      Then it throws TokenCipherError "Ciphertext failed authentication: wrong key or tampered data."

    @unhappy
    Scenario Outline: A tampered field fails authentication
      Given c is cipher.encrypt("secret") with the first character of field <field> replaced by a different base64url character, keeping its decoded length
      When cipher.decrypt(c) is called
      Then it throws TokenCipherError "Ciphertext failed authentication: wrong key or tampered data."
      And the error message contains neither "secret" nor K1

      Examples:
        | field |
        | 3     |
        | 4     |
        | 5     |

    @unhappy
    Scenario: The format is checked before the key id, and the key id before authentication
      Given "k2" is createTokenCipher(K2)
      And c is k2.encrypt("secret") with field 4 cut to 21 characters
      When cipher.decrypt(c) is called
      Then it throws TokenCipherError "Ciphertext is not in the v1 format."

  Rule: sameKeyId is exact, case-sensitive equality of two valid key ids

    @happy
    @boundary
    Scenario Outline: Comparing key ids
      When sameKeyId(<left>, <right>) is called
      Then it returns <result>

      Examples:
        | left       | right      | result |
        | "630dcd29" | "630dcd29" | true   |
        | "prod"     | "prod"     | true   |
        | "prod"     | "Prod"     | false  |
        | "prod"     | "prod "    | false  |
        | "prod"     | "staging"  | false  |
        | ""         | ""         | false  |
        | "k:1"      | "k:1"      | false  |
        | 65 × "k"   | 65 × "k"   | false  |

  Rule: jira_connection has the documented columns, constraint and foreign key

    @happy
    Scenario: Table and columns
      When getTableConfig(jiraConnection) is read
      Then its name is "jira_connection"
      And its columns are, by name: id, organization_id, cloud_id, site_url, site_name, email, access_token, refresh_token, expires_at, scopes, healthy, created_at, updated_at
      And exactly one column is primary, "id", with SQL type "text"
      And organization_id, cloud_id, site_url, site_name, scopes, healthy, created_at and updated_at are notNull
      And email, access_token, refresh_token and expires_at are not notNull
      And scopes has SQL type "text[]" and hasDefault true
      And healthy has default true
      And created_at and updated_at have hasDefault true

    @happy
    Scenario: One connection per site per organization
      When getTableConfig(jiraConnection).uniqueConstraints is read
      Then it contains "jira_connection_organization_cloud_unique" whose columns are ["organization_id", "cloud_id"] in that order

    @happy
    Scenario: A connection cascades with its organization
      When getTableConfig(jiraConnection).foreignKeys is read
      Then there is exactly one foreign key
      And its reference().foreignTable is organization and its onDelete is "cascade"

    @happy
    Scenario: The barrel re-exports the module and Better Auth does not see it
      Then every export of "src/schema/jira.ts" is the identical value exported by "src/schema.ts"
      And every table in "src/schema.ts" still has a distinct Postgres name, now ten of them
      And "jiraConnection" is not a key of authSchema

  Rule: upsert writes one connection per (organization, cloudId) with encrypted tokens

    @happy
    Scenario: A new connection
      Given the fake holds no rows
      When store.upsert("org_1", { cloudId: "c-1", siteUrl: "https://acme.atlassian.net", siteName: "Acme", email: "ada@acme.test", accessToken: "AT-1", refreshToken: "RT-1", expiresAt: "2026-11-04T12:00:00.000Z", scopes: ["read:jira-work", "offline_access"] }) is called
      Then the insert values have an id matching /^jrc_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      And the insert values have organizationId "org_1", cloudId "c-1", healthy true and expiresAt equal to new Date("2026-11-04T12:00:00.000Z")
      And the insert values' accessToken is not "AT-1" and cipher.decrypt of it is "AT-1"
      And the insert values' refreshToken is not "RT-1" and cipher.decrypt of it is "RT-1"
      And the conflict target is [jiraConnection.organizationId, jiraConnection.cloudId]
      And the result is { id: <that id>, cloudId: "c-1", siteUrl: "https://acme.atlassian.net", siteName: "Acme", email: "ada@acme.test", healthy: true, scopes: ["read:jira-work", "offline_access"], createdAt: <the returned row's createdAt as ISO string> }
      And the result has exactly those eight keys

    @happy
    Scenario: Reconnecting the same site updates the existing row
      Given the fake holds a row { id: "jrc_a", organizationId: "org_1", cloudId: "c-1", healthy: false, createdAt: 2026-01-01T00:00:00.000Z, … }
      And the fake applies the conflict set to a row with the same (organizationId, cloudId)
      When store.upsert("org_1", { cloudId: "c-1", siteUrl: "https://acme.atlassian.net", siteName: "Acme Corp", accessToken: "AT-2", refreshToken: "RT-2", expiresAt: null, scopes: [] }) is called
      Then the result has id "jrc_a", siteName "Acme Corp", email null, healthy true, scopes [] and createdAt "2026-01-01T00:00:00.000Z"
      And the conflict set has no id, organizationId, cloudId or createdAt key
      And the conflict set has updatedAt set to the SQL now() and healthy true

    @boundary
    Scenario Outline: Optional and nullable fields
      When store.upsert("org_1", <input>) is called with otherwise valid fields
      Then the insert values have <stored>

      Examples:
        | input                                                  | stored                                      |
        | email omitted                                          | email null                                  |
        | email: undefined                                       | email null                                  |
        | email: null                                            | email null                                  |
        | email: "Ada@ACME.test"                                 | email "Ada@ACME.test"                       |
        | accessToken: null, refreshToken: null                  | accessToken null, refreshToken null         |
        | accessToken: ""                                        | an accessToken ciphertext that decrypts to "" |
        | expiresAt: null                                        | expiresAt null                              |
        | expiresAt: "2026-11-04T12:00+01:00"                    | expiresAt new Date("2026-11-04T11:00:00.000Z") |
        | expiresAt: "2026-11-04T12:00:00.123456Z"               | expiresAt new Date("2026-11-04T12:00:00.123Z") |
        | scopes: ["b", "a", "b"]                                | scopes ["b", "a", "b"]                      |
        | siteName: " Acme "                                     | siteName " Acme "                           |

    @unhappy
    Scenario Outline: Rejected input issues no query
      When store.upsert("org_1", <input>) is called with otherwise valid fields
      Then it rejects with a RangeError whose message is <message>
      And the fake recorded no call

      Examples:
        | input                                       | message                                                                                    |
        | cloudId: ""                                 | "cloudId must not be empty."                                                               |
        | cloudId: "  "                               | "cloudId must not be empty."                                                               |
        | siteUrl: ""                                 | "siteUrl must not be empty."                                                               |
        | siteName: "\t"                              | "siteName must not be empty."                                                              |
        | cloudId: "", siteName: ""                   | "cloudId must not be empty."                                                               |
        | expiresAt: "soon"                           | 'expiresAt must be an ISO 8601 timestamp with an offset, got "soon".'                      |
        | expiresAt: "2026-11-04T12:00:00"            | 'expiresAt must be an ISO 8601 timestamp with an offset, got "2026-11-04T12:00:00".'       |
        | expiresAt: "2026-11-04"                     | 'expiresAt must be an ISO 8601 timestamp with an offset, got "2026-11-04".'                |
        | expiresAt: "2026-13-01T00:00:00Z"           | 'expiresAt must be an ISO 8601 timestamp with an offset, got "2026-13-01T00:00:00Z".'      |
        | expiresAt: "Wed, 04 Nov 2026 12:00:00 GMT"  | 'expiresAt must be an ISO 8601 timestamp with an offset, got "Wed, 04 Nov 2026 12:00:00 GMT".' |

    @unhappy
    Scenario: The insert returns no row
      Given the fake's insert … returning() resolves to []
      When store.upsert("org_1", a valid input) is called
      Then it rejects with an Error whose message is "Upsert returned no row."

    @concurrency
    Scenario: Two overlapping upserts of the same site leave one connection
      Given the fake enforces the unique (organizationId, cloudId) constraint by applying the conflict set
      When store.upsert("org_1", { cloudId: "c-1", siteName: "A", … }) and store.upsert("org_1", { cloudId: "c-1", siteName: "B", … }) are started without awaiting either
      Then both resolve with the same id
      And the fake holds exactly one row for ("org_1", "c-1"), with siteName from whichever insert the fake applied last
      And each upsert issued exactly one insert and no select

    @happy
    Scenario: The same site in two organizations is two connections
      Given the fake enforces the unique (organizationId, cloudId) constraint
      When store.upsert("org_1", { cloudId: "c-1", … }) and then store.upsert("org_2", { cloudId: "c-1", … }) are called
      Then the two results have different ids and the fake holds two rows

  Rule: list and get return summaries scoped to the organization and never decrypt

    @happy
    Scenario: list orders oldest first, then by id
      Given the fake holds rows for "org_1":
        | id    | createdAt                |
        | jrc_c | 2026-03-01T00:00:00.000Z |
        | jrc_b | 2026-01-01T00:00:00.000Z |
        | jrc_a | 2026-03-01T00:00:00.000Z |
      And a row "jrc_z" for "org_2"
      When store.list("org_1") is called
      Then it returns summaries with ids ["jrc_b", "jrc_a", "jrc_c"]
      And each summary has exactly the keys id, cloudId, siteUrl, siteName, email, healthy, scopes, createdAt

    @boundary
    Scenario: An organization with no connections
      When store.list("org_empty") is called
      Then it returns []

    @happy
    Scenario: Summaries do not need the key
      Given the fake holds a row for "org_1" whose accessToken is "not-a-ciphertext"
      When store.list("org_1") and store.get("org_1", <its id>) are called
      Then both resolve without throwing

    @happy
    Scenario: get returns one summary
      Given the fake holds row "jrc_a" for "org_1" with createdAt 2026-01-01T00:00:00.000Z, healthy false, email null
      When store.get("org_1", "jrc_a") is called
      Then it returns the summary with id "jrc_a", healthy false, email null and createdAt "2026-01-01T00:00:00.000Z"

    @unhappy
    Scenario Outline: get misses return null
      Given the fake holds row "jrc_a" for "org_1"
      When store.get(<organizationId>, <connectionId>) is called
      Then it returns null

      Examples:
        | organizationId | connectionId |
        | "org_2"        | "jrc_a"      |
        | "org_1"        | "jrc_nope"   |
        | "org_1"        | ""           |

  Rule: tokens returns the decrypted pair, scoped to the organization

    @happy
    Scenario: Decrypted tokens
      Given the fake holds row "jrc_a" for "org_1" with accessToken cipher.encrypt("AT-1"), refreshToken cipher.encrypt("RT-1"), expiresAt 2026-11-04T12:00:00.000Z and scopes ["read:jira-work"]
      When store.tokens("org_1", "jrc_a") is called
      Then it returns exactly { accessToken: "AT-1", refreshToken: "RT-1", expiresAt: "2026-11-04T12:00:00.000Z", scopes: ["read:jira-work"] }

    @boundary
    Scenario: Absent tokens and expiry stay null
      Given the fake holds row "jrc_a" for "org_1" with accessToken null, refreshToken null and expiresAt null
      When store.tokens("org_1", "jrc_a") is called
      Then it returns { accessToken: null, refreshToken: null, expiresAt: null, scopes: <the row's scopes> }

    @unhappy
    Scenario: Another organization's connection
      Given the fake holds row "jrc_a" for "org_1"
      When store.tokens("org_2", "jrc_a") is called
      Then it returns null

    @unhappy
    Scenario: Tokens written under another key propagate the cipher error and write nothing
      Given the fake holds row "jrc_a" for "org_1" whose accessToken is createTokenCipher(K2).encrypt("AT-1")
      When store.tokens("org_1", "jrc_a") is called
      Then it rejects with TokenCipherError 'Ciphertext was encrypted with key "72dbb733", not "630dcd29".'
      And the fake recorded no update

  Rule: saveTokens replaces the token set by connection id and marks the connection healthy

    @happy
    Scenario: A refreshed pair is stored encrypted
      Given the fake holds row "jrc_a" with healthy false
      When store.saveTokens("jrc_a", { accessToken: "AT-2", refreshToken: "RT-2", expiresAt: "2026-11-04T13:00:00.000Z", scopes: ["read:jira-work"] }) is called
      Then it resolves to undefined
      And the update set has exactly the keys accessToken, refreshToken, expiresAt, scopes, healthy, updatedAt
      And cipher.decrypt(set.accessToken) is "AT-2" and cipher.decrypt(set.refreshToken) is "RT-2"
      And set.expiresAt equals new Date("2026-11-04T13:00:00.000Z"), set.healthy is true and set.updatedAt is the SQL now()
      And the update is filtered by jiraConnection.id = "jrc_a" only

    @boundary
    Scenario: A grant without offline_access saves a null refresh token
      When store.saveTokens("jrc_a", { accessToken: "AT-2", refreshToken: null, expiresAt: null, scopes: [] }) is called
      Then the update set has refreshToken null and expiresAt null

    @boundary
    Scenario: An unknown connection id is a no-op
      Given the fake holds no rows
      When store.saveTokens("jrc_gone", { accessToken: "AT", refreshToken: "RT", expiresAt: null, scopes: [] }) is called
      Then it resolves to undefined
      And exactly one update was issued

    @unhappy
    Scenario: An unreadable expiry is rejected before any write
      When store.saveTokens("jrc_a", { accessToken: "AT", refreshToken: "RT", expiresAt: "3600", scopes: [] }) is called
      Then it rejects with RangeError 'expiresAt must be an ISO 8601 timestamp with an offset, got "3600".'
      And the fake recorded no call

  Rule: markUnhealthy flags a connection by id and is idempotent

    @happy
    Scenario: Flagging a connection
      Given the fake holds row "jrc_a" with healthy true
      When store.markUnhealthy("jrc_a") is called
      Then it resolves to undefined
      And the update set is exactly { healthy: false, updatedAt: <SQL now()> } filtered by jiraConnection.id = "jrc_a"
      And a following store.get(<its organization>, "jrc_a") returns healthy false

    @boundary
    Scenario: Flagging twice, or flagging an unknown id
      When store.markUnhealthy("jrc_a") is called twice and store.markUnhealthy("jrc_gone") once
      Then all three resolve to undefined and none rejects

    @concurrency
    Scenario: A refresh and a failure flag overlap
      Given the fake applies updates in the order their where() is called
      When store.saveTokens("jrc_a", …) and store.markUnhealthy("jrc_a") are started without awaiting either
      Then both resolve
      And the row's healthy is the value from whichever update the fake applied last

  Rule: remove deletes within the organization and reports whether anything was deleted

    @happy
    Scenario: Removing an existing connection
      Given the fake holds row "jrc_a" for "org_1"
      When store.remove("org_1", "jrc_a") is called
      Then it returns true
      And a following store.get("org_1", "jrc_a") returns null

    @unhappy
    Scenario Outline: Removing nothing
      Given the fake holds row "jrc_a" for "org_1"
      When store.remove(<organizationId>, <connectionId>) is called
      Then it returns false
      And the fake still holds row "jrc_a"

      Examples:
        | organizationId | connectionId |
        | "org_2"        | "jrc_a"      |
        | "org_1"        | "jrc_nope"   |

    @boundary
    Scenario: Removing twice
      Given the fake holds row "jrc_a" for "org_1"
      When store.remove("org_1", "jrc_a") is called twice
      Then the first returns true and the second returns false
```

Decided:

- Key encoding and whitespace: standard base64 of exactly 32 bytes, padding optional, surrounding whitespace trimmed, everything else rejected.
  - Ticket: silent.
  - Instead: also accept base64url or hex, or derive a key from any passphrase with a KDF.
- Default key id: first 8 hex characters of SHA-256 of the key bytes.
  - Ticket: "keyId?: string;"
  - Instead: a fixed default such as `"default"` or `"k1"`.
- Key id alphabet and length: `^[A-Za-z0-9_-]{1,64}$`, checked after the key.
  - Ticket: silent.
  - Instead: any non-empty string.
- Algorithm and ciphertext format: AES-256-GCM, `v1:<keyId>:<iv>:<tag>:<data>` in unpadded base64url, 12-byte random IV, AAD `v1:<keyId>`.
  - Ticket: silent.
  - Instead: one opaque base64 blob of iv‖tag‖data, with the key id held in its own column.
- Null handling in the cipher: `null` maps to `null` both ways, and `""` encrypts and round-trips.
  - Ticket: "encrypt(plaintext: string | null): string | null;"
  - Instead: treat `""` like `null`.
- Errors from decrypt: always `TokenCipherError`, with fixed messages, checked in the order format, then key id, then authentication.
  - Ticket: "export class TokenCipherError extends Error {"
  - Instead: return `null` for an undecryptable value.
- `sameKeyId` semantics: exact, case-sensitive equality, false unless both are valid key ids (so `("", "")` is false).
  - Ticket: "export function sameKeyId(left: string, right: string): boolean;"
  - Instead: plain `left === right`, or a timing-safe comparison that accepts any string.
- Table shape: the columns in the table above, `scopes` as `text[]`, `healthy` defaulting to true, cascade on organization delete, no extra index.
  - Ticket: "export const jiraConnection = …;"
  - Instead: scopes as a space-separated `text`, the same way `account.scope` is stored.
- Uniqueness: one connection per (organization, cloudId), and `upsert` resolves conflicts on that pair.
  - Ticket: "upsert(organizationId: string, input: JiraConnectionInput): Promise<JiraConnectionSummary>;"
  - Instead: unique on `cloudId` alone, so a site belongs to only one organization.
- Upsert overwrite semantics: every input field replaces the stored one, an omitted `email` becomes `null`, and `id` and `createdAt` are kept.
  - Ticket: "readonly email?: string | null;"
  - Instead: an omitted `email` keeps the stored value.
- Upsert, saveTokens and healthy: both set `healthy` back to `true`.
  - Ticket: silent.
  - Instead: leave `healthy` unchanged and require an explicit reset.
- Input validation: blank `cloudId`, `siteUrl` or `siteName`, or an `expiresAt` that is not ISO 8601 with an offset, rejects with `RangeError` before any query. Other strings are stored as given.
  - Ticket: silent.
  - Instead: no validation, or trimming and stripping trailing slashes from `siteUrl`.
- Scopes handling: stored and returned in the given order, duplicates kept.
  - Ticket: "readonly scopes: readonly string[];"
  - Instead: de-duplicate and sort.
- Timestamp formats: `createdAt` and `expiresAt` come out as `toISOString()` (UTC, milliseconds), and `updatedAt` is written as SQL `now()`, never from the process clock.
  - Ticket: "readonly createdAt: string;"
  - Instead: return `Date` objects or epoch milliseconds, or set `updatedAt` from `new Date()`.
- list ordering: `createdAt` ascending, ties by `id` ascending, sorted in JavaScript.
  - Ticket: "list(organizationId: string): Promise<JiraConnectionSummary[]>;"
  - Instead: newest first, or ordered by `siteName`.
- Cross-organization access: `get`, `tokens` and `remove` return `null` or `false` for another organization's id, the same as for a missing one.
  - Ticket: "get(organizationId: string, connectionId: string): Promise<JiraConnectionSummary | null>;"
  - Instead: throw a not-found or forbidden error.
- Unscoped writes: `saveTokens` and `markUnhealthy` filter by connection id only and are a silent no-op for an unknown id.
  - Ticket: "saveTokens(connectionId: string, tokens: {"
  - Instead: reject when no row was updated.
- Undecryptable stored tokens: `tokens()` lets the `TokenCipherError` propagate and does not mark the connection unhealthy itself.
  - Ticket: "tokens(organizationId: string, connectionId: string): Promise<JiraConnectionTokens | null>;"
  - Instead: return `null`, or mark the connection unhealthy and return `null`.
- Overlapping upserts: one `insert … on conflict do update` statement, never select-then-insert, so concurrent calls converge on one row.
  - Ticket: silent.
  - Instead: read, then insert or update, inside a transaction.
- Overlapping saveTokens and markUnhealthy: last write wins, with no versioning.
  - Ticket: "markUnhealthy(connectionId: string): Promise<void>;"
  - Instead: optimistic concurrency on `updatedAt`.
- Public surface: `src/index.ts` is not changed by this ticket.
  - Ticket: silent.
  - Instead: re-export the cipher and store from the package entry point.
