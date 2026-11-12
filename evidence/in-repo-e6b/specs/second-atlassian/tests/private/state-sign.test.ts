import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import { signState, verifyState } from "../../src/jira/state.js";

const SECRET = "0123456789abcdef0123456789abcdef";
const OTHER_SECRET = "another-secret-another-secret-xx";
const BASE = {
  organizationId: "org_1",
  userId: "user_1",
  returnTo: "/settings/jira",
} as const;
const T = 1700000000000;
const STATE_KEYS = ["organizationId", "userId", "returnTo", "issuedAt", "nonce"];

interface Full {
  organizationId: string;
  userId: string;
  returnTo: string;
  issuedAt: number;
  nonce: string;
}

/** base64url, no padding, of the UTF-8 bytes of `text`. */
function b64url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

function hmac(secret: string, payload: string): string {
  return createHmac("sha256", Buffer.from(secret, "utf8")).update(payload, "ascii").digest("base64url");
}

/** The value the spec defines for `state` under `secret`. */
function expected(secret: string, state: Full): string {
  const payload = b64url(
    JSON.stringify({
      organizationId: state.organizationId,
      userId: state.userId,
      returnTo: state.returnTo,
      issuedAt: state.issuedAt,
      nonce: state.nonce,
    }),
  );
  return `${payload}.${hmac(secret, payload)}`;
}

function split(value: string): [string, string] {
  const parts = value.split(".");
  assert.equal(parts.length, 2, value);
  return [parts[0]!, parts[1]!];
}

function decodePayload(value: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(split(value)[0], "base64url").toString("utf8"));
}

function lengthOf(state: Full): number {
  return b64url(JSON.stringify(state)).length + 1 + 43;
}

/** A returnTo of "/" + `unit` repeated, as long as fits `limit` for `state`. */
function longestReturnTo(state: Omit<Full, "returnTo">, unit: string, limit = 4096): string {
  let k = 0;
  while (lengthOf({ ...state, returnTo: "/" + unit.repeat(k + 1) }) <= limit) k += 1;
  return "/" + unit.repeat(k);
}

// ---- happy-5 ----------------------------------------------------------------

// Extends "[happy-5] a fully specified state signs to the known value": other
// field values, computed from the wire format, so a hard-coded value fails.
test("[happy-5] other fully specified states sign to the value the wire format defines", () => {
  const states: Full[] = [
    { organizationId: "org_2", userId: "user_9", returnTo: "/", issuedAt: 0, nonce: "x" },
    {
      organizationId: "org_01HZX3",
      userId: "usr_abcdef",
      returnTo: "/boards/42?tab=issues",
      issuedAt: 1712345678901,
      nonce: "Zm9vYmFyYmF6cXV4cXV1eA",
    },
    {
      organizationId: "o",
      userId: "u",
      returnTo: "/x",
      issuedAt: Number.MAX_SAFE_INTEGER,
      nonce: "-_-_-_-_-_-_-_-_-_-_-_",
    },
  ];
  for (const state of states) {
    assert.equal(signState(SECRET, state), expected(SECRET, state), JSON.stringify(state));
  }
});

// Extends "[happy-5] the known value's payload decodes to the exact JSON and the signature is 43 chars":
// characters JSON.stringify escapes, and multi-byte UTF-8, are encoded as the
// spec says (UTF-8 bytes of JSON.stringify), not as Latin-1 or UTF-16.
test("[happy-5] the payload is the UTF-8 of JSON.stringify for quotes, escapes and non-ASCII", () => {
  const state: Full = {
    organizationId: "org \"quoted\" \\ back",
    userId: "üser_ñ_日本",
    returnTo: "/emoji/🚀?a=\"b\"&c=\n\t\u0001",
    issuedAt: T,
    nonce: "n€",
  };
  const value = signState(SECRET, state);
  assert.equal(value, expected(SECRET, state));
  const [payload, signature] = split(value);
  assert.equal(
    Buffer.from(payload, "base64url").toString("utf8"),
    JSON.stringify({
      organizationId: state.organizationId,
      userId: state.userId,
      returnTo: state.returnTo,
      issuedAt: state.issuedAt,
      nonce: state.nonce,
    }),
  );
  assert.match(payload, /^[A-Za-z0-9_-]+$/);
  assert.equal(signature.length, 43);
  assert.match(signature, /^[A-Za-z0-9_-]{43}$/);
});

// Extends "[happy-5] the known value's payload decodes to the exact JSON and the signature is 43 chars":
// for every payload length mod 3 there is no "=" padding.
test("[happy-5] the payload has no padding at any length", () => {
  for (const nonce of ["a", "ab", "abc", "abcd", "abcde", "abcdef"]) {
    const state: Full = { ...BASE, issuedAt: T, nonce };
    const value = signState(SECRET, state);
    assert.equal(value, expected(SECRET, state));
    assert.ok(!value.includes("="), value);
    assert.equal(split(value)[1].length, 43);
  }
});

// ---- happy-6 ----------------------------------------------------------------

// Extends "[happy-6] signing the same fields twice returns the same string":
// other states, many calls, and a clock that moves between calls.
test("[happy-6] given issuedAt and nonce, signing is deterministic whatever the clock reads", (t) => {
  let clock = 5;
  t.mock.method(Date, "now", () => (clock += 1234567));
  for (const state of [
    { ...BASE, issuedAt: T, nonce: "n1" },
    { organizationId: "org_7", userId: "user_7", returnTo: "", issuedAt: 0, nonce: "zz" },
    { organizationId: "org_8", userId: "user_8", returnTo: "/ä", issuedAt: 42, nonce: "q" },
  ]) {
    const values = Array.from({ length: 5 }, () => signState(SECRET, state));
    for (const value of values) assert.equal(value, values[0]);
    assert.equal(values[0], expected(SECRET, state));
  }
});

// ---- happy-7 ----------------------------------------------------------------

// Extends "[happy-7] another secret keeps the payload and gives the known signature":
// other secrets, including a short one and a non-ASCII one keyed by its UTF-8 bytes.
test("[happy-7] the signature is the HMAC under each secret's UTF-8 bytes", () => {
  const state: Full = { ...BASE, issuedAt: T, nonce: "n1" };
  const payload = split(expected(SECRET, state))[0];
  const signatures = new Set<string>();
  for (const secret of ["k", OTHER_SECRET, "sécret-ü-🔑-日本語", SECRET.toUpperCase(), "x".repeat(200)]) {
    const [p, signature] = split(signState(secret, state));
    assert.equal(p, payload, secret);
    assert.equal(signature, hmac(secret, payload), secret);
    signatures.add(signature);
  }
  assert.equal(signatures.size, 5);
});

// ---- happy-8 ----------------------------------------------------------------

// Extends "[happy-8] an omitted nonce is 22 base64url chars and fresh on each call":
// more calls, every nonce distinct and canonical 16-byte base64url.
test("[happy-8] fifty omitted nonces are distinct canonical 16-byte base64url strings", () => {
  const nonces = new Set<string>();
  const values = new Set<string>();
  for (let i = 0; i < 50; i += 1) {
    const value = signState(SECRET, { ...BASE, issuedAt: T });
    const nonce = decodePayload(value).nonce;
    assert.equal(typeof nonce, "string");
    assert.match(nonce as string, /^[A-Za-z0-9_-]{22}$/);
    const bytes = Buffer.from(nonce as string, "base64url");
    assert.equal(bytes.length, 16);
    assert.equal(bytes.toString("base64url"), nonce);
    nonces.add(nonce as string);
    values.add(value);
  }
  assert.equal(nonces.size, 50);
  assert.equal(values.size, 50);
});

// Extends "[happy-8] a generated nonce decodes to 16 bytes and comes back from verifyState":
// the rest of the value is still the wire format, with the payload keys in order.
test("[happy-8] a value with a generated nonce is otherwise the defined wire format", () => {
  const value = signState(OTHER_SECRET, { organizationId: "org_5", userId: "user_5", returnTo: "/r", issuedAt: 77 });
  const decoded = decodePayload(value);
  assert.deepEqual(Object.keys(decoded), STATE_KEYS);
  assert.equal(
    value,
    expected(OTHER_SECRET, {
      organizationId: "org_5",
      userId: "user_5",
      returnTo: "/r",
      issuedAt: 77,
      nonce: decoded.nonce as string,
    }),
  );
});

// ---- happy-9 ----------------------------------------------------------------

// Extends "[happy-9] an omitted issuedAt is Date.now()": the clock is read on
// each call, not once.
test("[happy-9] an omitted issuedAt follows the clock from call to call", (t) => {
  let clock = 1234567890123;
  t.mock.method(Date, "now", () => clock);
  const first = decodePayload(signState(SECRET, { ...BASE, nonce: "n1" }));
  clock = 1999999999999;
  const second = decodePayload(signState(SECRET, { ...BASE, nonce: "n1" }));
  assert.equal(first.issuedAt, 1234567890123);
  assert.equal(second.issuedAt, 1999999999999);
});

// Extends "[happy-9] an omitted issuedAt at clock zero is 0": both omitted,
// and the value is exactly what the wire format gives for that issuedAt.
test("[happy-9] with issuedAt and nonce both omitted, issuedAt is Date.now()", (t) => {
  t.mock.method(Date, "now", () => T + 4321);
  const value = signState(SECRET, BASE);
  const decoded = decodePayload(value);
  assert.equal(decoded.issuedAt, T + 4321);
  assert.equal(value, expected(SECRET, { ...BASE, issuedAt: T + 4321, nonce: decoded.nonce as string }));
});

// ---- boundary-5 -------------------------------------------------------------

// Extends "[boundary-5] extra input properties are left out of the payload":
// several extras, placed before the five fields, of several types.
test("[boundary-5] many extra input properties, in any position, are not signed", () => {
  const input = {
    admin: true,
    extra: { nested: [1, 2] },
    ...BASE,
    issuedAt: T,
    role: "owner",
    nonce: "n1",
    count: 3,
  };
  const value = signState(SECRET, input as never);
  assert.deepEqual(Object.keys(decodePayload(value)), STATE_KEYS);
  assert.equal(value, expected(SECRET, { ...BASE, issuedAt: T, nonce: "n1" }));
});

// Extends "[boundary-5] an extra input property does not change the value":
// a toJSON on the input does not reach the payload.
test("[boundary-5] a toJSON property on the input is not signed and does not reshape the payload", () => {
  const input = { ...BASE, issuedAt: T, nonce: "n1", toJSON: () => ({ hacked: true }) };
  const value = signState(SECRET, input as never);
  assert.equal(value, expected(SECRET, { ...BASE, issuedAt: T, nonce: "n1" }));
});

// ---- boundary-6 -------------------------------------------------------------

// Extends "[boundary-6] returnTo with query, unicode, an absolute URL or dots round-trips verbatim":
// other returnTo values the spec does not validate.
test("[boundary-6] other returnTo values round-trip verbatim", () => {
  for (const returnTo of [
    "//evil.example/path",
    "javascript:alert(1)",
    " /padded ",
    "/quote\"and\\backslash",
    "/line\nbreak\ttab",
    "/emoji/🚀/日本",
    "%2F%2Fencoded",
    ".",
    "...",
    "relative/path",
  ]) {
    const value = signState(SECRET, { ...BASE, returnTo, issuedAt: T, nonce: "n1" });
    assert.equal(value, expected(SECRET, { ...BASE, returnTo, issuedAt: T, nonce: "n1" }), returnTo);
    assert.deepEqual(
      verifyState(SECRET, value, "user_1", T),
      { ok: true, state: { ...BASE, returnTo, issuedAt: T, nonce: "n1" } },
      returnTo,
    );
  }
});

// ---- unhappy-2 --------------------------------------------------------------

// Extends "[unhappy-2] invalid signState input throws a TypeError": other
// issuedAt values that are not non-negative safe integers.
test("[unhappy-2] other issuedAt values outside the non-negative safe integers throw a TypeError", () => {
  for (const issuedAt of [
    -Infinity,
    -1.5,
    -T,
    0.1,
    T + 0.5,
    Number.MAX_SAFE_INTEGER + 2,
    2 ** 60,
    Number.MAX_VALUE,
    Number.MIN_SAFE_INTEGER,
  ]) {
    assert.throws(
      () => signState(SECRET, { ...BASE, issuedAt, nonce: "n1" }),
      TypeError,
      String(issuedAt),
    );
  }
});

// Extends "[unhappy-2] invalid signState input throws a TypeError": the
// empty-field checks apply when nonce and issuedAt are generated too, and
// with other values in the remaining fields.
test("[unhappy-2] an empty secret, organizationId or userId throws a TypeError with generated fields", () => {
  const cases: [string, Parameters<typeof signState>[1]][] = [
    ["", BASE],
    ["", { ...BASE, issuedAt: T }],
    ["", { ...BASE, nonce: "n1" }],
    [SECRET, { ...BASE, organizationId: "" }],
    [SECRET, { ...BASE, userId: "" }],
    [SECRET, { ...BASE, organizationId: "", userId: "", returnTo: "" }],
    [SECRET, { organizationId: "org_9", userId: "", returnTo: "/x", issuedAt: 0, nonce: "zz" }],
    [SECRET, { organizationId: "", userId: "user_9", returnTo: "/x", issuedAt: 0, nonce: "zz" }],
  ];
  for (const [secret, state] of cases) {
    assert.throws(() => signState(secret, state), TypeError, JSON.stringify({ secret, state }));
  }
});

// Extends "[unhappy-2] an issuedAt just past the safe-integer range throws a TypeError":
// the edges of the valid range sign rather than throw.
test("[unhappy-2] issuedAt 0 and Number.MAX_SAFE_INTEGER are valid and sign", () => {
  for (const issuedAt of [0, Number.MAX_SAFE_INTEGER]) {
    const state: Full = { ...BASE, issuedAt, nonce: "n1" };
    assert.equal(signState(SECRET, state), expected(SECRET, state));
  }
});

// Extends "[unhappy-2] invalid signState input throws a TypeError": a field
// that is non-empty whitespace is not empty.
test("[unhappy-2] whitespace-only fields are non-empty and sign", () => {
  const state: Full = { organizationId: " ", userId: "\t", returnTo: "/", issuedAt: T, nonce: " " };
  const value = signState(" ", state);
  assert.equal(value, expected(" ", state));
});

// ---- boundary-7 -------------------------------------------------------------

// Extends "[boundary-7] one character past the 4096 limit throws a RangeError":
// the limit is on the signed value, so multi-byte characters count by their
// encoded size, not by returnTo's length.
test("[boundary-7] a returnTo of multi-byte characters that encodes past 4096 throws a RangeError", () => {
  const returnTo = "/" + "ä".repeat(1500);
  assert.ok(returnTo.length < 2000);
  assert.ok(lengthOf({ ...BASE, returnTo, issuedAt: T, nonce: "n1" }) > 4096);
  assert.throws(() => signState(SECRET, { ...BASE, returnTo, issuedAt: T, nonce: "n1" }), RangeError);
});

// Extends "[boundary-7] one character past the 4096 limit throws a RangeError":
// longer other fields move the limit, and a generated nonce counts too.
test("[boundary-7] one character past 4096 throws a RangeError for other field sizes", () => {
  const big = { organizationId: "org_" + "o".repeat(300), userId: "user_" + "u".repeat(200), issuedAt: T, nonce: "nonce-" + "n".repeat(100) };
  const returnTo = longestReturnTo(big, "b") + "b";
  assert.ok(lengthOf({ ...big, returnTo }) > 4096);
  assert.throws(() => signState(SECRET, { ...big, returnTo }), RangeError);

  const generated = { ...BASE, issuedAt: T, nonce: "A".repeat(22) };
  const tooLong = longestReturnTo(generated, "c") + "c";
  assert.ok(lengthOf({ ...generated, returnTo: tooLong }) > 4096);
  assert.throws(() => signState(SECRET, { ...BASE, returnTo: tooLong, issuedAt: T }), RangeError);
});

// Extends "[boundary-7] signState throws a RangeError for a value far over 4096 chars":
// a long nonce or organizationId, not only returnTo, trips the limit.
test("[boundary-7] an over-long organizationId or nonce throws a RangeError", () => {
  assert.throws(
    () => signState(SECRET, { ...BASE, organizationId: "o".repeat(3100), issuedAt: T, nonce: "n1" }),
    RangeError,
  );
  assert.throws(
    () => signState(SECRET, { ...BASE, issuedAt: T, nonce: "n".repeat(5000) }),
    RangeError,
  );
});

// ---- boundary-8 -------------------------------------------------------------

// Extends "[boundary-8] a signed value of exactly 4096 chars is issued and verifies":
// other field sizes and multi-byte returnTo, filled to exactly 4096.
test("[boundary-8] values of exactly 4096 chars with other fields are issued and verify", () => {
  const fills: [Omit<Full, "returnTo">, string][] = [
    [{ organizationId: "org_" + "o".repeat(300), userId: "user_1", issuedAt: T, nonce: "n1" }, "a"],
    [{ organizationId: "org_1", userId: "user_1", issuedAt: 0, nonce: "q".repeat(40) }, "a"],
    [{ organizationId: "org_1", userId: "user_1", issuedAt: T, nonce: "n1" }, "ab"],
  ];
  for (const [fields, unit] of fills) {
    // Pad with "a" until the length lands on 4096 exactly.
    let returnTo = longestReturnTo(fields, unit);
    while (lengthOf({ ...fields, returnTo: returnTo + "a" }) <= 4096) returnTo += "a";
    const state: Full = { ...fields, returnTo };
    assert.equal(lengthOf(state), 4096, JSON.stringify(fields));
    const value = signState(SECRET, state);
    assert.equal(value.length, 4096);
    assert.equal(value, expected(SECRET, state));
    assert.deepEqual(verifyState(SECRET, value, fields.userId, fields.issuedAt), { ok: true, state });
  }
});

// Extends "[boundary-8] the 4096-char value's state carries the full returnTo":
// a returnTo of multi-byte characters at exactly 4096.
test("[boundary-8] a 4096-char value with a multi-byte returnTo is issued and verifies", () => {
  const fields = { ...BASE, issuedAt: T, nonce: "n1" };
  let found: string | undefined;
  for (let k = 0; k < 3000 && found === undefined; k += 1) {
    for (const tail of ["", "a", "aa"]) {
      const returnTo = "/" + "ä".repeat(k) + tail;
      if (lengthOf({ ...fields, returnTo }) === 4096) {
        found = returnTo;
        break;
      }
    }
  }
  assert.ok(found !== undefined);
  assert.ok(found.includes("ä"));
  const value = signState(SECRET, { ...fields, returnTo: found });
  assert.equal(value.length, 4096);
  assert.deepEqual(verifyState(SECRET, value, "user_1", T), {
    ok: true,
    state: { ...fields, returnTo: found },
  });
});
