/**
 * Signs and verifies the OAuth `state` parameter for the Jira connect flow.
 * The value binds the flow to the organization being connected, the signed-in
 * user who started it, and where to send them afterwards. Stateless: an HMAC
 * under a caller-supplied secret (the caller passes `BETTER_AUTH_SECRET`), with
 * no database.
 */

/** What a `state` value carries. */
export interface JiraOAuthState {
  readonly organizationId: string;
  readonly userId: string;
  readonly returnTo: string;
  readonly issuedAt: number;
  readonly nonce: string;
}

/** Why `verifyState` rejected a value; the first failing check is reported. */
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
 * Signs `state` as `<payload>.<signature>`. An omitted `issuedAt` is
 * `Date.now()`; an omitted `nonce` is 9 random bytes, base64url. Does not
 * validate its input and never throws.
 */
export function signState(
  _secret: string,
  _state: Omit<JiraOAuthState, "issuedAt" | "nonce"> &
    Partial<Pick<JiraOAuthState, "issuedAt" | "nonce">>,
): string {
  throw new Error("not implemented");
}

/**
 * Verifies a value from `signState` under `secret`, for `expectedUserId`, at
 * `now`. Never throws: failures are returned as `{ ok: false, reason }`.
 */
export function verifyState(
  _secret: string,
  _value: string | undefined,
  _expectedUserId: string,
  _now: number = Date.now(),
): StateResult {
  throw new Error("not implemented");
}
