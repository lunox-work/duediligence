# Second Atlassian app for connecting a client's Jira site

Sign-in uses the Atlassian app configured by `ATLASSIAN_CLIENT_ID` /
`ATLASSIAN_CLIENT_SECRET`. That app asks for identity only (`read:me`,
`offline_access`). Connecting a client's Jira site needs a grant with
`READ_SCOPES` (`packages/jira/src/oauth.ts`), and this change moves that grant
to a **second** Atlassian app. The change has two parts:

1. `apps/api/src/env.ts` reads that app's credentials from two new optional
   variables. `jiraOAuthConfig` resolves them to a credential pair, or to
   `undefined` when connecting Jira is not configured.
2. `apps/api/src/jira/state.ts` is a new module. It signs and verifies the OAuth
   `state` parameter for the connect flow. The value binds the flow to the
   organization being connected, the signed-in user who started it, and where
   to send them afterwards. It is stateless: an HMAC under a caller-supplied
   secret, with no database. The caller passes `BETTER_AUTH_SECRET`, so no new
   variable is needed for signing.

## Exports

### `apps/api/src/env.ts`

New schema keys. Both are optional, and an empty string is treated as unset:

```ts
JIRA_CLIENT_ID: string | undefined;     // on Env
JIRA_CLIENT_SECRET: string | undefined; // on Env
```

New function, signature as in the ticket:

```ts
export function jiraOAuthConfig(env: Env): {
    clientId: string;
    clientSecret: string;
} | undefined;
```

Unchanged behaviour: `parseEnv`, `appUrl`, `buildInfo`, `objectStoreConfig`.
`ATLASSIAN_CLIENT_ID` and `ATLASSIAN_CLIENT_SECRET` are still required and
keep their messages. `Env` gains the two fields above and nothing else.
`envKeys` gains exactly `"JIRA_CLIENT_ID"` and `"JIRA_CLIENT_SECRET"`. The list
pinned in `test/env-surface.test.ts` (and the table in `docs/versioning.md`)
must be updated with them, under "Sign-in" next to the `ATLASSIAN_*` pair.
`env.ts` stays the only file in `apps/api/src` that reads `process.env`.

### `apps/api/src/jira/state.ts` (new)

As in the ticket:

```ts
export interface JiraOAuthState {
    readonly organizationId: string;
    readonly userId: string;
    readonly returnTo: string;
    readonly issuedAt: number;
    readonly nonce: string;
}

export type StateFailure = "malformed" | "bad-signature" | "expired" | "wrong-user";

export type StateResult = {
    ok: true;
    state: JiraOAuthState;
} | {
    ok: false;
    reason: StateFailure;
};

export function signState(secret: string, state: Omit<JiraOAuthState, "issuedAt" | "nonce"> & Partial<Pick<JiraOAuthState, "issuedAt" | "nonce">>): string;

export function verifyState(secret: string, value: string | undefined, expectedUserId: string, now: number = Date.now()): StateResult;
```

The module has no other exports. These values are internal, but the spec fixes
them and tests may rely on them:

| Name                | Value                 | Meaning                                                |
| ------------------- | --------------------- | ------------------------------------------------------ |
| lifetime            | `600_000` ms (10 min) | Longest allowed age, `now - issuedAt`                  |
| future skew         | `60_000` ms (1 min)   | How far `issuedAt` may be ahead of `now`               |
| maximum length      | `4096` characters     | Longest value `signState` returns or `verifyState` accepts |
| generated nonce     | 16 random bytes, base64url, no padding (22 chars) | Used when `nonce` is omitted |

**Wire format.** The value is `<payload>.<signature>`:

- `payload` is the base64url encoding (RFC 4648 §5, no `=` padding) of the
  UTF-8 bytes of `JSON.stringify` applied to an object with exactly these keys,
  in this order: `organizationId`, `userId`, `returnTo`, `issuedAt`, `nonce`.
- `signature` is the base64url encoding (no padding) of
  `HMAC-SHA256(key = UTF-8 bytes of secret, message = ASCII bytes of payload)`.
  It is always 43 characters.

`verifyState` compares signatures in constant time (`timingSafeEqual`), and
only after checking that the lengths match.

**Check order in `verifyState`.** It stops at the first failure:

1. `value` is `undefined`, empty, longer than 4096 characters, does not consist
   of exactly two non-empty segments separated by one `.`, or has a segment
   with a character outside `[A-Za-z0-9_-]` → `"malformed"`.
2. The signature does not equal the HMAC of the payload segment under `secret`
   → `"bad-signature"`.
3. The payload does not decode as UTF-8 JSON, is not a plain object, or a field
   is missing or has the wrong type (see the rules for payload fields) →
   `"malformed"`.
4. `issuedAt` falls outside the validity window → `"expired"`.
5. `userId !== expectedUserId` → `"wrong-user"`.
6. Otherwise `{ ok: true, state }`. `state` holds exactly the five fields,
   decoded from the payload.

```gherkin
Feature: Second Atlassian app for connecting a Jira site

  Background:
    Given "required" is the set of variables `test/env.test.ts` already uses:
      DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET,
      ATLASSIAN_CLIENT_ID, ATLASSIAN_CLIENT_SECRET, TOKEN_ENCRYPTION_KEY
    And SECRET is "0123456789abcdef0123456789abcdef"
    And BASE is the state
      | organizationId | userId | returnTo       |
      | org_1          | user_1 | /settings/jira |
    And T is 1700000000000

  Rule: The Jira app's credentials are two optional variables, and the API boots without them

    @happy
    Scenario: Both variables set yield the credential pair
      Given parseEnv of required plus JIRA_CLIENT_ID "jira-client-id" and JIRA_CLIENT_SECRET "jira-client-secret"
      When jiraOAuthConfig is called with that env
      Then it returns exactly { clientId: "jira-client-id", clientSecret: "jira-client-secret" }

    @happy
    Scenario: Neither variable set means connecting Jira is not configured
      Given parseEnv of required alone
      Then parseEnv does not throw
      And env.JIRA_CLIENT_ID is undefined
      And env.JIRA_CLIENT_SECRET is undefined
      And jiraOAuthConfig of that env is undefined

    @boundary
    Scenario Outline: A half-configured app is treated as not configured, not as a boot error
      Given parseEnv of required plus <vars>
      Then parseEnv does not throw
      And jiraOAuthConfig of that env is undefined

      Examples:
        | vars                                                  |
        | JIRA_CLIENT_ID "jira-client-id"                       |
        | JIRA_CLIENT_SECRET "jira-client-secret"               |
        | JIRA_CLIENT_ID "jira-client-id", JIRA_CLIENT_SECRET "" |
        | JIRA_CLIENT_ID "", JIRA_CLIENT_SECRET "jira-client-secret" |

    @boundary
    Scenario: An empty value is read as unset
      Given parseEnv of required plus JIRA_CLIENT_ID "" and JIRA_CLIENT_SECRET ""
      Then env.JIRA_CLIENT_ID is undefined
      And env.JIRA_CLIENT_SECRET is undefined
      And jiraOAuthConfig of that env is undefined

    @boundary
    Scenario: Non-empty values are kept verbatim, without trimming
      Given parseEnv of required plus JIRA_CLIENT_ID " id " and JIRA_CLIENT_SECRET "s=cr+t/"
      Then jiraOAuthConfig returns { clientId: " id ", clientSecret: "s=cr+t/" }

    @boundary
    Scenario: The Jira app never falls back to the sign-in app
      Given parseEnv of required, where ATLASSIAN_CLIENT_ID is "atlassian-client-id"
      Then jiraOAuthConfig of that env is undefined

    @happy
    Scenario: The sign-in app is unaffected by the Jira app
      Given parseEnv of required plus JIRA_CLIENT_ID "jira-client-id" and JIRA_CLIENT_SECRET "jira-client-secret"
      Then env.ATLASSIAN_CLIENT_ID is "atlassian-client-id"
      And env.ATLASSIAN_CLIENT_SECRET is "atlassian-client-secret"

    @unhappy
    Scenario: The sign-in app's credentials stay required even when the Jira app is set
      Given required plus JIRA_CLIENT_ID "jira-client-id" and JIRA_CLIENT_SECRET "jira-client-secret"
      When parseEnv is called with ATLASSIAN_CLIENT_ID set to ""
      Then it throws an Error matching /ATLASSIAN_CLIENT_ID/

    @happy
    Scenario: The environment surface grows by exactly the two variables
      Then envKeys contains "JIRA_CLIENT_ID" and "JIRA_CLIENT_SECRET"
      And envKeys has exactly two more entries than before the change

  Rule: signState produces "<payload>.<signature>" in the fixed wire format

    @happy
    Scenario: A fully specified state signs to a known value
      When signState(SECRET, { organizationId: "org_1", userId: "user_1", returnTo: "/settings/jira", issuedAt: 1700000000000, nonce: "AAAAAAAAAAAAAAAAAAAAAA" }) is called
      Then it returns
        """
        eyJvcmdhbml6YXRpb25JZCI6Im9yZ18xIiwidXNlcklkIjoidXNlcl8xIiwicmV0dXJuVG8iOiIvc2V0dGluZ3MvamlyYSIsImlzc3VlZEF0IjoxNzAwMDAwMDAwMDAwLCJub25jZSI6IkFBQUFBQUFBQUFBQUFBQUFBQUFBQUEifQ.Urh3QevT-f-UKuDamXCEWtrqVSKKyJdzD09Kp0ROuIA
        """
      And the payload segment decodes to
        """
        {"organizationId":"org_1","userId":"user_1","returnTo":"/settings/jira","issuedAt":1700000000000,"nonce":"AAAAAAAAAAAAAAAAAAAAAA"}
        """

    @happy
    Scenario: Signing is deterministic when issuedAt and nonce are given
      Given the same secret and the same five fields
      When signState is called twice
      Then both calls return the same string

    @happy
    Scenario: The signature depends on the secret
      When the state above is signed with "another-secret-another-secret-xx" instead of SECRET
      Then the payload segment is unchanged
      And the signature segment is "iampN5VG6Lx4428tXUfkqkWvs4GMwZpD6l2F9XUs23o"

    @happy
    Scenario: An omitted nonce is 16 fresh random bytes
      When signState(SECRET, { ...BASE, issuedAt: T }) is called twice
      Then each decoded payload's nonce matches /^[A-Za-z0-9_-]{22}$/
      And the two nonces differ
      And the two returned values differ

    @happy
    Scenario: An omitted issuedAt is the current time
      Given the clock reads Date.now() = N just before the call and M just after
      When signState(SECRET, BASE) is called
      Then the decoded payload's issuedAt is an integer with N <= issuedAt <= M

    @boundary
    Scenario: Properties outside the five fields are not signed
      When signState(SECRET, { ...BASE, issuedAt: T, nonce: "n1", extra: "x" } as never) is called
      Then the decoded payload has exactly the keys organizationId, userId, returnTo, issuedAt, nonce

    @boundary
    Scenario Outline: returnTo is carried verbatim, whatever it holds
      When signState(SECRET, { ...BASE, returnTo: <returnTo>, issuedAt: T, nonce: "n1" }) is called
      And verifyState(SECRET, that value, "user_1", T) is called
      Then the result is ok and state.returnTo is <returnTo>

      Examples:
        | returnTo                          |
        | ""                                |
        | "/boards?q=ä&x=1#top"             |
        | "https://evil.example/"           |
        | "/a.b.c"                          |

    @unhappy
    Scenario Outline: Invalid input is a programmer error and throws
      When signState(<secret>, <state>) is called
      Then it throws a <error>

      Examples:
        | secret | state                                                    | error      |
        | ""     | { ...BASE, issuedAt: T, nonce: "n1" }                    | TypeError  |
        | SECRET | { ...BASE, organizationId: "", issuedAt: T, nonce: "n1" } | TypeError  |
        | SECRET | { ...BASE, userId: "", issuedAt: T, nonce: "n1" }        | TypeError  |
        | SECRET | { ...BASE, issuedAt: T, nonce: "" }                      | TypeError  |
        | SECRET | { ...BASE, issuedAt: -1, nonce: "n1" }                   | TypeError  |
        | SECRET | { ...BASE, issuedAt: 1.5, nonce: "n1" }                  | TypeError  |
        | SECRET | { ...BASE, issuedAt: NaN, nonce: "n1" }                  | TypeError  |
        | SECRET | { ...BASE, issuedAt: Infinity, nonce: "n1" }             | TypeError  |

    @boundary
    Scenario: signState refuses to issue a value verifyState would reject for length
      When signState(SECRET, { ...BASE, returnTo: "/" + "a".repeat(4000), issuedAt: T, nonce: "n1" }) is called
      Then it throws a RangeError

    @boundary
    Scenario: A value of up to 4096 characters is issued and verifies
      Given a returnTo of "/" followed by "a" repeated as many times as gives a signed value of exactly 4096 characters
      When it is signed with issuedAt T and nonce "n1" and verified as "user_1" at T
      Then the result is ok

  Rule: verifyState accepts a value it signed, for the user who started the flow, within the window

    @happy
    Scenario: A freshly signed value verifies
      Given value = signState(SECRET, { ...BASE, issuedAt: T, nonce: "n1" })
      When verifyState(SECRET, value, "user_1", T + 1000) is called
      Then it returns { ok: true, state: { organizationId: "org_1", userId: "user_1", returnTo: "/settings/jira", issuedAt: 1700000000000, nonce: "n1" } }

    @happy
    Scenario: now defaults to the current time
      Given value = signState(SECRET, BASE)
      When verifyState(SECRET, value, "user_1") is called with no now
      Then the result is ok

    @boundary
    Scenario: Verification is stateless, so the same value verifies more than once
      Given value = signState(SECRET, { ...BASE, issuedAt: T, nonce: "n1" })
      When verifyState(SECRET, value, "user_1", T) is called twice
      Then both results are ok and deep-equal

  Rule: A value is valid while now - 600000 <= issuedAt <= now + 60000; outside that window the result is "expired"

    @boundary
    Scenario Outline: Age and skew boundaries
      Given value = signState(SECRET, { ...BASE, issuedAt: T, nonce: "n1" })
      When verifyState(SECRET, value, "user_1", <now>) is called
      Then the result is <result>

      Examples:
        | now          | result                               |
        | T            | ok                                   |
        | T + 600000   | ok                                   |
        | T + 600001   | { ok: false, reason: "expired" }     |
        | T + 86400000 | { ok: false, reason: "expired" }     |
        | T - 60000    | ok                                   |
        | T - 60001    | { ok: false, reason: "expired" }     |
        | NaN          | { ok: false, reason: "expired" }     |

  Rule: A value that is not in the wire format is "malformed", checked before the signature

    @unhappy
    Scenario Outline: Shape failures
      When verifyState(SECRET, <value>, "user_1", T) is called
      Then it returns { ok: false, reason: "malformed" }

      Examples:
        | value                                   |
        | undefined                               |
        | ""                                      |
        | "abc"                                   |
        | "."                                     |
        | "abc."                                  |
        | ".abc"                                  |
        | "a.b.c"                                 |
        | "a+b.c"                                 |
        | "ab=.c"                                 |
        | " " + a valid value                     |
        | a valid value + "\n"                    |
        | "a".repeat(4000) + "." + "b".repeat(96) |

    @unhappy
    Scenario Outline: A correctly signed payload that is not a valid state is "malformed"
      Given P is the base64url (no padding) of the UTF-8 bytes of <json>
      And value is P + "." + base64url(HMAC-SHA256(SECRET, P))
      When verifyState(SECRET, value, "user_1", T) is called
      Then it returns { ok: false, reason: "malformed" }

      Examples:
        | json                                                                                          |
        | not json                                                                                      |
        | "a string"                                                                                    |
        | [1,2]                                                                                         |
        | null                                                                                          |
        | {"userId":"user_1","returnTo":"/","issuedAt":1700000000000,"nonce":"n1"}                      |
        | {"organizationId":"","userId":"user_1","returnTo":"/","issuedAt":1700000000000,"nonce":"n1"}  |
        | {"organizationId":"org_1","userId":7,"returnTo":"/","issuedAt":1700000000000,"nonce":"n1"}    |
        | {"organizationId":"org_1","userId":"user_1","returnTo":null,"issuedAt":1700000000000,"nonce":"n1"} |
        | {"organizationId":"org_1","userId":"user_1","returnTo":"/","issuedAt":"1700000000000","nonce":"n1"} |
        | {"organizationId":"org_1","userId":"user_1","returnTo":"/","issuedAt":1.5,"nonce":"n1"}       |
        | {"organizationId":"org_1","userId":"user_1","returnTo":"/","issuedAt":-1,"nonce":"n1"}        |
        | {"organizationId":"org_1","userId":"user_1","returnTo":"/","issuedAt":1700000000000,"nonce":""} |

    @boundary
    Scenario: Extra keys in a correctly signed payload are dropped, not rejected
      Given P encodes {"organizationId":"org_1","userId":"user_1","returnTo":"/","issuedAt":1700000000000,"nonce":"n1","admin":true}
      And value is P + "." + base64url(HMAC-SHA256(SECRET, P))
      When verifyState(SECRET, value, "user_1", T) is called
      Then the result is ok
      And state has exactly the keys organizationId, userId, returnTo, issuedAt, nonce

  Rule: A value not signed under this secret is "bad-signature", whatever its payload says

    @unhappy
    Scenario: Signed under another secret
      Given value = signState("another-secret-another-secret-xx", { ...BASE, issuedAt: T, nonce: "n1" })
      When verifyState(SECRET, value, "user_1", T) is called
      Then it returns { ok: false, reason: "bad-signature" }

    @unhappy
    Scenario: A payload rewritten to another user keeps the old signature
      Given value = signState(SECRET, { ...BASE, issuedAt: T, nonce: "n1" }) with signature S
      And P2 encodes the same payload with userId "user_2"
      When verifyState(SECRET, P2 + "." + S, "user_2", T) is called
      Then it returns { ok: false, reason: "bad-signature" }

    @unhappy
    Scenario Outline: A damaged signature
      Given value = signState(SECRET, { ...BASE, issuedAt: T, nonce: "n1" }) = P + "." + S
      When verifyState(SECRET, P + "." + <signature>, "user_1", T) is called
      Then it returns { ok: false, reason: "bad-signature" }

      Examples:
        | signature                                  |
        | S with its last character changed          |
        | S without its last character               |
        | S + "A"                                    |
        | "A"                                        |

    @unhappy
    Scenario: An expired value with a bad signature reports the signature
      Given value = signState("another-secret-another-secret-xx", { ...BASE, issuedAt: T, nonce: "n1" })
      When verifyState(SECRET, value, "user_2", T + 86400000) is called
      Then it returns { ok: false, reason: "bad-signature" }

    @unhappy
    Scenario: An empty secret is a programmer error
      When verifyState("", any value, "user_1", T) is called
      Then it throws a TypeError

  Rule: The flow belongs to the user who started it; another user gets "wrong-user"

    @unhappy
    Scenario Outline: The expected user does not match exactly
      Given value = signState(SECRET, { ...BASE, issuedAt: T, nonce: "n1" })
      When verifyState(SECRET, value, <expectedUserId>, T) is called
      Then it returns { ok: false, reason: "wrong-user" }

      Examples:
        | expectedUserId |
        | "user_2"       |
        | "USER_1"       |
        | "user_1 "      |
        | ""             |

    @unhappy
    Scenario: Expiry is reported before the user mismatch
      Given value = signState(SECRET, { ...BASE, issuedAt: T, nonce: "n1" })
      When verifyState(SECRET, value, "user_2", T + 600001) is called
      Then it returns { ok: false, reason: "expired" }
```

`signState` and `verifyState` are synchronous and pure apart from `Date.now()`
and the random nonce, so calls cannot overlap and no `@concurrency` scenarios
apply. `verifyState` keeps no record of the values it has seen. If the flow must
be single-use, the caller enforces that (for example, by also binding the
nonce to a cookie).

The window, precisely: a value is inside it exactly
when `now - 600_000 <= issuedAt` **and** `issuedAt <= now + 60_000`. Any other
`now`, including `NaN`, gives `"expired"`.

Decided:

- The names of the two new variables are `JIRA_CLIENT_ID` and `JIRA_CLIENT_SECRET`.
  - Ticket: "feat(jira): add a second Atlassian app for connecting a client's site (#30)"
  - Instead: `ATLASSIAN_JIRA_CLIENT_ID` / `ATLASSIAN_JIRA_CLIENT_SECRET`, next to the sign-in pair.
- Both variables are optional, and the API boots without them.
  - Ticket: silent.
  - Instead: make them required, like every other OAuth credential in `env.ts`.
- If only one of the two is set, `jiraOAuthConfig` returns `undefined` (as `objectStoreConfig` does) and `parseEnv` does not throw.
  - Ticket: silent.
  - Instead: `parseEnv` throws at boot and names the missing half.
- An empty value is parsed as `undefined`. Non-empty values are kept verbatim, without trimming.
  - Ticket: silent.
  - Instead: reject an empty value with `min(1)`, as the required credentials do.
- No fallback to `ATLASSIAN_CLIENT_*` when the Jira app is unset.
  - Ticket: silent.
  - Instead: fall back to the sign-in app, which is how the connect grant worked before.
- No new variable for the state-signing secret. `secret` is a parameter, and the caller passes `BETTER_AUTH_SECRET`.
  - Ticket: silent.
  - Instead: add a dedicated `JIRA_STATE_SECRET` variable.
- The wire format is `base64url(JSON payload in fixed key order) "." base64url(HMAC-SHA256)`, with no padding.
  - Ticket: silent.
  - Instead: a JWT (HS256) with a header segment, or an encrypted (AES-GCM) blob.
- The lifetime is 10 minutes, and a value exactly 600 000 ms old is still valid.
  - Ticket: silent.
  - Instead: 15 minutes, or an exclusive bound (`<` instead of `<=`).
- `issuedAt` may be up to 60 s ahead of `now`. Further ahead gives `"expired"`.
  - Ticket: silent.
  - Instead: accept any future `issuedAt`, or reject any future one as `"malformed"`.
- A `NaN` `now` gives `"expired"`. `now` is not validated separately.
  - Ticket: silent.
  - Instead: throw a `TypeError` for a non-finite `now`.
- An omitted nonce is 16 random bytes, base64url (22 characters).
  - Ticket: silent.
  - Instead: `crypto.randomUUID()`.
- An omitted `issuedAt` is `Date.now()`.
  - Ticket: silent.
  - Instead: a required `now` parameter on `signState`.
- The check order is shape, then signature, then payload, then expiry, then user. The first failure is reported.
  - Ticket: silent.
  - Instead: check the user before expiry, or decode the payload before checking the signature.
- The maximum value length is 4096 characters. `signState` throws a `RangeError` rather than issue a longer value.
  - Ticket: silent.
  - Instead: no length limit.
- Invalid `signState` input (empty secret, empty `organizationId`/`userId`/nonce, or an `issuedAt` that is not a non-negative safe integer) throws a `TypeError`. An empty secret passed to `verifyState` also throws a `TypeError`.
  - Ticket: silent.
  - Instead: accept any input and leave a bad state to fail at `verifyState`.
- `returnTo` is carried verbatim and not validated (it may be empty or absolute). Guarding against open redirects is the caller's job.
  - Ticket: silent.
  - Instead: `signState`/`verifyState` reject a `returnTo` that is not a same-origin path (`/` but not `//`).
- Extra input properties are not signed. Extra keys in a correctly signed payload are dropped, not rejected.
  - Ticket: silent.
  - Instead: reject unknown payload keys as `"malformed"`.
- The `wrong-user` comparison is exact and case-sensitive.
  - Ticket: silent.
  - Instead: compare case-insensitively.
- `verifyState` is stateless, so the same value verifies more than once within the window.
  - Ticket: silent.
  - Instead: single-use values tracked in a nonce store.
- The lifetime, skew and length limits are internal constants, not exports.
  - Ticket: "The change adds or changes these exports (`…` is a value the ticket does not give):"
  - Instead: export a `STATE_TTL_MS` constant.
