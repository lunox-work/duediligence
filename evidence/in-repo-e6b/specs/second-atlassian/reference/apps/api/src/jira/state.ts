/**
 * Signs and verifies the OAuth `state` parameter for the Jira connect flow.
 * The value binds the flow to the organization being connected, the signed-in
 * user who started it, and where to send them afterwards. Stateless: an HMAC
 * under a caller-supplied secret, with no database.
 *
 * Wire format: `<payload>.<signature>`, where `payload` is the base64url (no
 * padding) of the UTF-8 JSON of the five fields in a fixed order, and
 * `signature` is the base64url (no padding) of HMAC-SHA256 over the payload
 * segment's ASCII bytes. The caller passes `BETTER_AUTH_SECRET` as the secret.
 *
 * `verifyState` keeps no record of the values it has seen, so a value verifies
 * as often as it is presented within its window. If the flow must be
 * single-use, the caller enforces that (for example, by binding the nonce to a
 * cookie).
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

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

/** Longest allowed age, `now - issuedAt`, in ms. Inclusive. */
const LIFETIME_MS = 600_000;
/** How far `issuedAt` may be ahead of `now`, in ms. Inclusive. */
const FUTURE_SKEW_MS = 60_000;
/** Longest value `signState` returns or `verifyState` accepts. */
const MAX_LENGTH = 4096;
/** Random bytes in a generated nonce: 22 base64url characters. */
const NONCE_BYTES = 16;

const SEGMENT = /^[A-Za-z0-9_-]+$/;

function hmac(secret: string, payload: string): string {
  return createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(Buffer.from(payload, "ascii"))
    .digest("base64url");
}

function requireSecret(secret: string): void {
  if (typeof secret !== "string" || secret === "") {
    throw new TypeError("secret must be a non-empty string.");
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

function isIssuedAt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

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
  secret: string,
  state: Omit<JiraOAuthState, "issuedAt" | "nonce"> &
    Partial<Pick<JiraOAuthState, "issuedAt" | "nonce">>,
): string {
  requireSecret(secret);
  const issuedAt = state.issuedAt ?? Date.now();
  const nonce = state.nonce ?? randomBytes(NONCE_BYTES).toString("base64url");
  if (!isNonEmptyString(state.organizationId)) {
    throw new TypeError("organizationId must be a non-empty string.");
  }
  if (!isNonEmptyString(state.userId)) {
    throw new TypeError("userId must be a non-empty string.");
  }
  if (typeof state.returnTo !== "string") {
    throw new TypeError("returnTo must be a string.");
  }
  if (!isIssuedAt(issuedAt)) {
    throw new TypeError("issuedAt must be a non-negative safe integer.");
  }
  if (!isNonEmptyString(nonce)) {
    throw new TypeError("nonce must be a non-empty string.");
  }

  // A fresh object in the fixed key order: extra input properties (including
  // a toJSON) are not signed.
  const fields: JiraOAuthState = {
    organizationId: state.organizationId,
    userId: state.userId,
    returnTo: state.returnTo,
    issuedAt,
    nonce,
  };
  const payload = Buffer.from(JSON.stringify(fields), "utf8").toString(
    "base64url",
  );
  const value = `${payload}.${hmac(secret, payload)}`;
  if (value.length > MAX_LENGTH) {
    throw new RangeError(
      `Signed state is ${value.length} characters, over the ${MAX_LENGTH} limit.`,
    );
  }
  return value;
}

/** The five fields of a decoded payload, or undefined if it is not a state. */
function decodePayload(payload: string): JiraOAuthState | undefined {
  let parsed: unknown;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.from(payload, "base64url"),
    );
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }
  const { organizationId, userId, returnTo, issuedAt, nonce } =
    parsed as Record<string, unknown>;
  if (
    !isNonEmptyString(organizationId) ||
    !isNonEmptyString(userId) ||
    typeof returnTo !== "string" ||
    !isIssuedAt(issuedAt) ||
    !isNonEmptyString(nonce)
  ) {
    return undefined;
  }
  return { organizationId, userId, returnTo, issuedAt, nonce };
}

/**
 * Verifies a `state` value signed under `secret` for the user who started the
 * flow, at `now`. Throws a `TypeError` for an empty secret.
 *
 * Checks, stopping at the first failure: the wire shape ("malformed"), the
 * signature ("bad-signature"), the payload ("malformed"), the window
 * `now - 600000 <= issuedAt <= now + 60000` ("expired", also for a NaN `now`),
 * then the user, compared exactly ("wrong-user").
 */
export function verifyState(
  secret: string,
  value: string | undefined,
  expectedUserId: string,
  now: number = Date.now(),
): StateResult {
  requireSecret(secret);

  if (
    typeof value !== "string" ||
    value === "" ||
    value.length > MAX_LENGTH
  ) {
    return { ok: false, reason: "malformed" };
  }
  const segments = value.split(".");
  if (segments.length !== 2) return { ok: false, reason: "malformed" };
  const [payload, signature] = segments as [string, string];
  if (!SEGMENT.test(payload) || !SEGMENT.test(signature)) {
    return { ok: false, reason: "malformed" };
  }

  // Compared as text, not decoded bytes: a signature that differs only in the
  // unused low bits of its last character is still a different signature.
  const expected = Buffer.from(hmac(secret, payload), "ascii");
  const actual = Buffer.from(signature, "ascii");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, reason: "bad-signature" };
  }

  const state = decodePayload(payload);
  if (state === undefined) return { ok: false, reason: "malformed" };

  if (
    !(now - LIFETIME_MS <= state.issuedAt && state.issuedAt <= now + FUTURE_SKEW_MS)
  ) {
    return { ok: false, reason: "expired" };
  }

  if (state.userId !== expectedUserId) {
    return { ok: false, reason: "wrong-user" };
  }

  return { ok: true, state };
}
