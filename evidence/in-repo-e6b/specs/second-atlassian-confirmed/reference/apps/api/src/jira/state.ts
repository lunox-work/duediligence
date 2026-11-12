/**
 * Signs and verifies the OAuth `state` parameter for the Jira connect flow.
 * The value binds the flow to the organization being connected, the signed-in
 * user who started it, and where to send them afterwards. Stateless: an HMAC
 * under a caller-supplied secret (the caller passes `BETTER_AUTH_SECRET`), with
 * no database.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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
  "malformed" | "bad-signature" | "expired" | "wrong-user";

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

/** Longest allowed age of a value, `now - issuedAt`, in ms. Inclusive. */
const LIFETIME_MS = 600_000;

/** How far `issuedAt` may be ahead of `now`, in ms, to allow for clock skew. */
const FUTURE_SKEW_MS = 60_000;

/** Random bytes in a generated nonce: 12 base64url characters. */
const NONCE_BYTES = 9;

/**
 * Signs `state` as `<payload>.<signature>`. An omitted `issuedAt` is
 * `Date.now()`; an omitted `nonce` is 9 random bytes, base64url. Does not
 * validate its input and never throws.
 */
export function signState(
  secret: string,
  state: Omit<JiraOAuthState, "issuedAt" | "nonce"> &
    Partial<Pick<JiraOAuthState, "issuedAt" | "nonce">>,
): string {
  // Exactly these keys, in this order: the payload is part of the wire format.
  const payload = Buffer.from(
    JSON.stringify({
      organizationId: state.organizationId,
      userId: state.userId,
      returnTo: state.returnTo,
      issuedAt: state.issuedAt ?? Date.now(),
      nonce: state.nonce ?? randomBytes(NONCE_BYTES).toString("base64url"),
    }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${sign(secret, payload)}`;
}

/**
 * Verifies a value from `signState` under `secret`, for `expectedUserId`, at
 * `now`. Never throws: failures are returned as `{ ok: false, reason }`.
 *
 * Checks, in order, stopping at the first failure: shape, signature, payload,
 * expiry, user. Stateless, so a value verifies as often as it is presented
 * within its window; a caller that needs single use must enforce it.
 */
export function verifyState(
  secret: string,
  value: string | undefined,
  expectedUserId: string,
  now: number = Date.now(),
): StateResult {
  if (value === undefined) return fail("malformed");
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return fail("malformed");
  const payload = value.slice(0, dot);
  const signature = value.slice(dot + 1);

  if (!signatureMatches(sign(secret, payload), signature)) {
    return fail("bad-signature");
  }

  const state = decodePayload(payload);
  if (state === undefined) return fail("malformed");

  // Written so that a NaN `now` makes both comparisons false.
  if (
    now - state.issuedAt > LIFETIME_MS ||
    state.issuedAt > now + FUTURE_SKEW_MS
  ) {
    return fail("expired");
  }

  if (state.userId !== expectedUserId) return fail("wrong-user");

  return { ok: true, state };
}

function fail(reason: StateFailure): StateResult {
  return { ok: false, reason };
}

/** base64url (no padding) of HMAC-SHA256 over the payload segment. */
function sign(secret: string, payload: string): string {
  return createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(payload, "ascii")
    .digest("base64url");
}

/** Constant-time comparison, once the lengths are known to match. */
function signatureMatches(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(actual, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** The five fields of a signed payload, or undefined if it is not a state. */
function decodePayload(payload: string): JiraOAuthState | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8.decode(Buffer.from(payload, "base64url")));
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }
  const { organizationId, userId, returnTo, issuedAt, nonce } =
    parsed as Record<string, unknown>;
  if (
    typeof organizationId !== "string" ||
    typeof userId !== "string" ||
    typeof returnTo !== "string" ||
    typeof issuedAt !== "number" ||
    !Number.isFinite(issuedAt) ||
    typeof nonce !== "string"
  ) {
    return undefined;
  }
  // Rebuilt rather than returned as parsed, so extra keys are dropped.
  return { organizationId, userId, returnTo, issuedAt, nonce };
}
