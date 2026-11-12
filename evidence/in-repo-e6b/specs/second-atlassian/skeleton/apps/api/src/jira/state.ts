/**
 * Signs and verifies the OAuth `state` parameter for the Jira connect flow.
 * The value binds the flow to the organization being connected, the signed-in
 * user who started it, and where to send them afterwards. Stateless: an HMAC
 * under a caller-supplied secret, with no database.
 */

/** What a signed `state` value carries. */
export interface JiraOAuthState {
  readonly organizationId: string;
  readonly userId: string;
  readonly returnTo: string;
  readonly issuedAt: number;
  readonly nonce: string;
}

/** Why `verifyState` rejected a value. */
export type StateFailure =
  | "malformed"
  | "bad-signature"
  | "expired"
  | "wrong-user";

/** The outcome of `verifyState`. */
export type StateResult =
  | {
      ok: true;
      state: JiraOAuthState;
    }
  | {
      ok: false;
      reason: StateFailure;
    };

/**
 * Signs `state` under `secret` as `<payload>.<signature>`. An omitted
 * `issuedAt` is `Date.now()`; an omitted `nonce` is 16 random bytes,
 * base64url.
 *
 * Throws a `TypeError` for an empty secret, an empty `organizationId`,
 * `userId` or nonce, or an `issuedAt` that is not a non-negative safe
 * integer. Throws a `RangeError` rather than return a value longer than 4096
 * characters.
 */
export function signState(
  _secret: string,
  _state: Omit<JiraOAuthState, "issuedAt" | "nonce"> &
    Partial<Pick<JiraOAuthState, "issuedAt" | "nonce">>,
): string {
  throw new Error("not implemented");
}

/**
 * Verifies a `state` value signed under `secret` for the user who started the
 * flow, at `now`. Throws a `TypeError` for an empty secret.
 */
export function verifyState(
  _secret: string,
  _value: string | undefined,
  _expectedUserId: string,
  _now: number = Date.now(),
): StateResult {
  throw new Error("not implemented");
}
