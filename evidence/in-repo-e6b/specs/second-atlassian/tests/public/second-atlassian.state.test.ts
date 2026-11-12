import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import { signState, verifyState } from "../src/jira/state.js";

const SECRET = "0123456789abcdef0123456789abcdef";
const OTHER_SECRET = "another-secret-another-secret-xx";
const BASE = {
  organizationId: "org_1",
  userId: "user_1",
  returnTo: "/settings/jira",
} as const;
const T = 1700000000000;

const KNOWN =
  "eyJvcmdhbml6YXRpb25JZCI6Im9yZ18xIiwidXNlcklkIjoidXNlcl8xIiwicmV0dXJuVG8iOiIvc2V0dGluZ3MvamlyYSIsImlzc3VlZEF0IjoxNzAwMDAwMDAwMDAwLCJub25jZSI6IkFBQUFBQUFBQUFBQUFBQUFBQUFBQUEifQ.Urh3QevT-f-UKuDamXCEWtrqVSKKyJdzD09Kp0ROuIA";
const KNOWN_INPUT = {
  organizationId: "org_1",
  userId: "user_1",
  returnTo: "/settings/jira",
  issuedAt: 1700000000000,
  nonce: "AAAAAAAAAAAAAAAAAAAAAA",
};
const STATE_KEYS = ["organizationId", "userId", "returnTo", "issuedAt", "nonce"];
const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** base64url, no padding, of the UTF-8 bytes of `text`. */
function b64url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

function hmac(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** A value whose payload is `json`, correctly signed under SECRET. */
function signedJson(json: string): string {
  const payload = b64url(json);
  return `${payload}.${hmac(SECRET, payload)}`;
}

function split(value: string): [string, string] {
  const [payload, signature] = value.split(".");
  return [payload!, signature!];
}

function decodePayload(value: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(split(value)[0], "base64url").toString("utf8"));
}

/** The standard value most scenarios start from. */
function standard(): string {
  return signState(SECRET, { ...BASE, issuedAt: T, nonce: "n1" });
}

/** Length of the value signState would produce for BASE with this returnTo. */
function lengthFor(returnTo: string): number {
  const json = JSON.stringify({ ...BASE, returnTo, issuedAt: T, nonce: "n1" });
  return b64url(json).length + 1 + 43;
}

/** The longest "/" + "a"*k returnTo whose signed value fits in 4096. */
function longestReturnTo(): string {
  let k = 0;
  while (lengthFor("/" + "a".repeat(k + 1)) <= 4096) k += 1;
  return "/" + "a".repeat(k);
}

/** `signature` with its last character replaced by one encoding different bits. */
function changeLast(signature: string): string {
  const last = signature[signature.length - 1]!;
  const replacement = ALPHABET[(ALPHABET.indexOf(last) + 4) % 64]!;
  return signature.slice(0, -1) + replacement;
}

// ---- happy-5: known value -------------------------------------------------

test("[happy-5] a fully specified state signs to the known value", () => {
  assert.equal(signState(SECRET, KNOWN_INPUT), KNOWN);
});

test("[happy-5] the known value's payload decodes to the exact JSON and the signature is 43 chars", () => {
  const [payload, signature] = split(signState(SECRET, KNOWN_INPUT));
  assert.equal(
    Buffer.from(payload, "base64url").toString("utf8"),
    '{"organizationId":"org_1","userId":"user_1","returnTo":"/settings/jira","issuedAt":1700000000000,"nonce":"AAAAAAAAAAAAAAAAAAAAAA"}',
  );
  assert.equal(signature.length, 43);
});

// ---- happy-6: deterministic -----------------------------------------------

test("[happy-6] signing the same fields twice returns the same string", () => {
  assert.equal(standard(), standard());
});

test("[happy-6] the input's property order does not change the value", () => {
  const reordered = {
    nonce: "n1",
    issuedAt: T,
    returnTo: BASE.returnTo,
    userId: BASE.userId,
    organizationId: BASE.organizationId,
  };
  assert.equal(signState(SECRET, reordered), standard());
});

// ---- happy-7: signature depends on the secret ------------------------------

test("[happy-7] another secret keeps the payload and gives the known signature", () => {
  const [payload, signature] = split(signState(OTHER_SECRET, KNOWN_INPUT));
  assert.equal(payload, split(KNOWN)[0]);
  assert.equal(signature, "iampN5VG6Lx4428tXUfkqkWvs4GMwZpD6l2F9XUs23o");
});

test("[happy-7] a secret differing in one character changes only the signature", () => {
  const [payload, signature] = split(
    signState("0123456789abcdef0123456789abcdeX", KNOWN_INPUT),
  );
  assert.equal(payload, split(KNOWN)[0]);
  assert.notEqual(signature, split(KNOWN)[1]);
  assert.equal(signature.length, 43);
});

// ---- happy-8: omitted nonce -------------------------------------------------

test("[happy-8] an omitted nonce is 22 base64url chars and fresh on each call", () => {
  const a = signState(SECRET, { ...BASE, issuedAt: T });
  const b = signState(SECRET, { ...BASE, issuedAt: T });
  const nonceA = decodePayload(a).nonce;
  const nonceB = decodePayload(b).nonce;
  assert.match(String(nonceA), /^[A-Za-z0-9_-]{22}$/);
  assert.match(String(nonceB), /^[A-Za-z0-9_-]{22}$/);
  assert.equal(typeof nonceA, "string");
  assert.notEqual(nonceA, nonceB);
  assert.notEqual(a, b);
});

test("[happy-8] a generated nonce decodes to 16 bytes and comes back from verifyState", () => {
  const value = signState(SECRET, { ...BASE, issuedAt: T });
  const nonce = decodePayload(value).nonce as string;
  assert.equal(Buffer.from(nonce, "base64url").length, 16);
  const result = verifyState(SECRET, value, "user_1", T);
  assert.ok(result.ok);
  assert.equal(result.state.nonce, nonce);
});

// ---- happy-9: omitted issuedAt ----------------------------------------------

test("[happy-9] an omitted issuedAt is Date.now()", (t) => {
  t.mock.method(Date, "now", () => T);
  const issuedAt = decodePayload(signState(SECRET, { ...BASE, nonce: "n1" })).issuedAt;
  assert.equal(issuedAt, T);
  assert.ok(Number.isInteger(issuedAt));
});

test("[happy-9] an omitted issuedAt at clock zero is 0", (t) => {
  t.mock.method(Date, "now", () => 0);
  assert.equal(decodePayload(signState(SECRET, BASE)).issuedAt, 0);
});

// ---- boundary-5: extra input properties not signed --------------------------

test("[boundary-5] extra input properties are left out of the payload", () => {
  const value = signState(SECRET, { ...BASE, issuedAt: T, nonce: "n1", extra: "x" } as never);
  assert.deepEqual(Object.keys(decodePayload(value)), STATE_KEYS);
});

test("[boundary-5] an extra input property does not change the value", () => {
  const value = signState(SECRET, { ...BASE, issuedAt: T, nonce: "n1", extra: "x" } as never);
  assert.equal(value, standard());
});

// ---- boundary-6: returnTo carried verbatim ----------------------------------

test("[boundary-6] returnTo with query, unicode, an absolute URL or dots round-trips verbatim", () => {
  for (const returnTo of ["/boards?q=ä&x=1#top", "https://evil.example/", "/a.b.c"]) {
    const value = signState(SECRET, { ...BASE, returnTo, issuedAt: T, nonce: "n1" });
    const result = verifyState(SECRET, value, "user_1", T);
    assert.ok(result.ok, returnTo);
    assert.equal(result.state.returnTo, returnTo);
  }
});

test("[boundary-6] an empty returnTo round-trips verbatim", () => {
  const value = signState(SECRET, { ...BASE, returnTo: "", issuedAt: T, nonce: "n1" });
  const result = verifyState(SECRET, value, "user_1", T);
  assert.ok(result.ok);
  assert.equal(result.state.returnTo, "");
});

// ---- unhappy-2: invalid signState input -------------------------------------

test("[unhappy-2] invalid signState input throws a TypeError", () => {
  const cases: [string, Parameters<typeof signState>[1]][] = [
    ["", { ...BASE, issuedAt: T, nonce: "n1" }],
    [SECRET, { ...BASE, organizationId: "", issuedAt: T, nonce: "n1" }],
    [SECRET, { ...BASE, userId: "", issuedAt: T, nonce: "n1" }],
    [SECRET, { ...BASE, issuedAt: T, nonce: "" }],
    [SECRET, { ...BASE, issuedAt: -1, nonce: "n1" }],
    [SECRET, { ...BASE, issuedAt: 1.5, nonce: "n1" }],
    [SECRET, { ...BASE, issuedAt: NaN, nonce: "n1" }],
    [SECRET, { ...BASE, issuedAt: Infinity, nonce: "n1" }],
  ];
  for (const [secret, state] of cases) {
    assert.throws(() => signState(secret, state), TypeError, JSON.stringify({ secret, state }));
  }
});

test("[unhappy-2] an issuedAt just past the safe-integer range throws a TypeError", () => {
  assert.throws(
    () => signState(SECRET, { ...BASE, issuedAt: Number.MAX_SAFE_INTEGER + 1, nonce: "n1" }),
    TypeError,
  );
});

// ---- boundary-7: signState refuses an over-long value ----------------------

test("[boundary-7] signState throws a RangeError for a value far over 4096 chars", () => {
  assert.throws(
    () => signState(SECRET, { ...BASE, returnTo: "/" + "a".repeat(4000), issuedAt: T, nonce: "n1" }),
    RangeError,
  );
});

test("[boundary-7] one character past the 4096 limit throws a RangeError", () => {
  const returnTo = longestReturnTo() + "a";
  assert.ok(lengthFor(returnTo) > 4096);
  assert.throws(
    () => signState(SECRET, { ...BASE, returnTo, issuedAt: T, nonce: "n1" }),
    RangeError,
  );
});

// ---- boundary-8: a 4096-character value is issued and verifies --------------

test("[boundary-8] a signed value of exactly 4096 chars is issued and verifies", () => {
  const returnTo = longestReturnTo();
  const value = signState(SECRET, { ...BASE, returnTo, issuedAt: T, nonce: "n1" });
  assert.equal(value.length, 4096);
  assert.equal(verifyState(SECRET, value, "user_1", T).ok, true);
});

test("[boundary-8] the 4096-char value's state carries the full returnTo", () => {
  const returnTo = longestReturnTo();
  const value = signState(SECRET, { ...BASE, returnTo, issuedAt: T, nonce: "n1" });
  assert.deepEqual(verifyState(SECRET, value, "user_1", T), {
    ok: true,
    state: { ...BASE, returnTo, issuedAt: T, nonce: "n1" },
  });
});

// ---- happy-10: a freshly signed value verifies ------------------------------

test("[happy-10] a freshly signed value verifies a second later", () => {
  assert.deepEqual(verifyState(SECRET, standard(), "user_1", T + 1000), {
    ok: true,
    state: {
      organizationId: "org_1",
      userId: "user_1",
      returnTo: "/settings/jira",
      issuedAt: 1700000000000,
      nonce: "n1",
    },
  });
});

test("[happy-10] a freshly signed value verifies at the instant it was issued", () => {
  assert.deepEqual(verifyState(SECRET, standard(), "user_1", T), {
    ok: true,
    state: { ...BASE, issuedAt: T, nonce: "n1" },
  });
});

// ---- happy-11: now defaults to the current time -----------------------------

test("[happy-11] verifyState with no now uses Date.now()", (t) => {
  t.mock.method(Date, "now", () => T);
  const value = signState(SECRET, BASE);
  assert.equal(verifyState(SECRET, value, "user_1").ok, true);
});

test("[happy-11] verifyState with no now reads the clock at call time", (t) => {
  let clock = T;
  t.mock.method(Date, "now", () => clock);
  const value = signState(SECRET, BASE);
  clock = T + 600001;
  assert.deepEqual(verifyState(SECRET, value, "user_1"), { ok: false, reason: "expired" });
});

// ---- boundary-9: stateless ---------------------------------------------------

test("[boundary-9] the same value verifies twice with deep-equal results", () => {
  const value = standard();
  const first = verifyState(SECRET, value, "user_1", T);
  const second = verifyState(SECRET, value, "user_1", T);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first, second);
});

test("[boundary-9] a value verified once still verifies at the end of its window", () => {
  const value = standard();
  assert.equal(verifyState(SECRET, value, "user_1", T).ok, true);
  assert.equal(verifyState(SECRET, value, "user_1", T + 600000).ok, true);
});

// ---- boundary-10: age and skew boundaries -----------------------------------

test("[boundary-10] a value is valid from 60000 ms before to 600000 ms after issuedAt", () => {
  const value = standard();
  for (const now of [T, T + 600000, T - 60000]) {
    assert.equal(verifyState(SECRET, value, "user_1", now).ok, true, `now = T + ${now - T}`);
  }
});

test("[boundary-10] a value outside the window, or at a NaN now, is expired", () => {
  const value = standard();
  for (const now of [T + 600001, T + 86400000, T - 60001, NaN]) {
    assert.deepEqual(
      verifyState(SECRET, value, "user_1", now),
      { ok: false, reason: "expired" },
      `now = ${now}`,
    );
  }
});

// ---- unhappy-3: shape failures ----------------------------------------------

test("[unhappy-3] values not in the wire format are malformed", () => {
  const valid = standard();
  for (const value of [
    undefined,
    "",
    "abc",
    ".",
    "abc.",
    ".abc",
    "a.b.c",
    "a+b.c",
    "ab=.c",
    " " + valid,
    valid + "\n",
    "a".repeat(4000) + "." + "b".repeat(96),
  ]) {
    assert.deepEqual(
      verifyState(SECRET, value, "user_1", T),
      { ok: false, reason: "malformed" },
      JSON.stringify(value),
    );
  }
});

test("[unhappy-3] a correctly signed 4096-char value with one more char is malformed", () => {
  const value = signState(SECRET, { ...BASE, returnTo: longestReturnTo(), issuedAt: T, nonce: "n1" });
  assert.deepEqual(verifyState(SECRET, value + "A", "user_1", T), {
    ok: false,
    reason: "malformed",
  });
});

// ---- unhappy-4: correctly signed payload that is not a valid state ----------

test("[unhappy-4] a correctly signed payload that is not a valid state is malformed", () => {
  for (const json of [
    "not json",
    '"a string"',
    "[1,2]",
    "null",
    '{"userId":"user_1","returnTo":"/","issuedAt":1700000000000,"nonce":"n1"}',
    '{"organizationId":"","userId":"user_1","returnTo":"/","issuedAt":1700000000000,"nonce":"n1"}',
    '{"organizationId":"org_1","userId":7,"returnTo":"/","issuedAt":1700000000000,"nonce":"n1"}',
    '{"organizationId":"org_1","userId":"user_1","returnTo":null,"issuedAt":1700000000000,"nonce":"n1"}',
    '{"organizationId":"org_1","userId":"user_1","returnTo":"/","issuedAt":"1700000000000","nonce":"n1"}',
    '{"organizationId":"org_1","userId":"user_1","returnTo":"/","issuedAt":1.5,"nonce":"n1"}',
    '{"organizationId":"org_1","userId":"user_1","returnTo":"/","issuedAt":-1,"nonce":"n1"}',
    '{"organizationId":"org_1","userId":"user_1","returnTo":"/","issuedAt":1700000000000,"nonce":""}',
  ]) {
    assert.deepEqual(
      verifyState(SECRET, signedJson(json), "user_1", T),
      { ok: false, reason: "malformed" },
      json,
    );
  }
});

test("[unhappy-4] a correctly signed empty object is malformed", () => {
  assert.deepEqual(verifyState(SECRET, signedJson("{}"), "user_1", T), {
    ok: false,
    reason: "malformed",
  });
});

// ---- boundary-11: extra keys in a signed payload are dropped ----------------

test("[boundary-11] extra keys in a correctly signed payload are dropped", () => {
  const value = signedJson(
    '{"organizationId":"org_1","userId":"user_1","returnTo":"/","issuedAt":1700000000000,"nonce":"n1","admin":true}',
  );
  const result = verifyState(SECRET, value, "user_1", T);
  assert.ok(result.ok);
  assert.deepEqual(Object.keys(result.state).sort(), [...STATE_KEYS].sort());
});

test("[boundary-11] a nested extra key is dropped and the five fields are decoded", () => {
  const value = signedJson(
    '{"organizationId":"org_1","userId":"user_1","returnTo":"/","issuedAt":1700000000000,"nonce":"n1","extra":{"nested":[1]}}',
  );
  assert.deepEqual(verifyState(SECRET, value, "user_1", T), {
    ok: true,
    state: { organizationId: "org_1", userId: "user_1", returnTo: "/", issuedAt: T, nonce: "n1" },
  });
});

// ---- unhappy-5: signed under another secret ---------------------------------

test("[unhappy-5] a value signed under another secret is a bad signature", () => {
  const value = signState(OTHER_SECRET, { ...BASE, issuedAt: T, nonce: "n1" });
  assert.deepEqual(verifyState(SECRET, value, "user_1", T), {
    ok: false,
    reason: "bad-signature",
  });
});

test("[unhappy-5] a secret differing in its last character is a bad signature", () => {
  const value = signState("0123456789abcdef0123456789abcdeX", { ...BASE, issuedAt: T, nonce: "n1" });
  assert.deepEqual(verifyState(SECRET, value, "user_1", T), {
    ok: false,
    reason: "bad-signature",
  });
});

// ---- unhappy-6: payload rewritten, old signature kept -----------------------

test("[unhappy-6] a payload rewritten to user_2 with the old signature is a bad signature", () => {
  const [, signature] = split(standard());
  const p2 = b64url(JSON.stringify({ ...BASE, userId: "user_2", issuedAt: T, nonce: "n1" }));
  assert.deepEqual(verifyState(SECRET, `${p2}.${signature}`, "user_2", T), {
    ok: false,
    reason: "bad-signature",
  });
});

test("[unhappy-6] a payload with a rewritten returnTo and the old signature is a bad signature", () => {
  const [, signature] = split(standard());
  const p2 = b64url(
    JSON.stringify({ ...BASE, returnTo: "https://evil.example/", issuedAt: T, nonce: "n1" }),
  );
  assert.deepEqual(verifyState(SECRET, `${p2}.${signature}`, "user_1", T), {
    ok: false,
    reason: "bad-signature",
  });
});

// ---- unhappy-7: damaged signature -------------------------------------------

test("[unhappy-7] a damaged signature is a bad signature", () => {
  const [payload, signature] = split(standard());
  for (const damaged of [
    changeLast(signature),
    signature.slice(0, -1),
    signature + "A",
    "A",
  ]) {
    assert.deepEqual(
      verifyState(SECRET, `${payload}.${damaged}`, "user_1", T),
      { ok: false, reason: "bad-signature" },
      damaged,
    );
  }
});

test("[unhappy-7] a doubled signature is a bad signature", () => {
  const [payload, signature] = split(standard());
  assert.deepEqual(verifyState(SECRET, `${payload}.${signature}${signature}`, "user_1", T), {
    ok: false,
    reason: "bad-signature",
  });
});

// ---- unhappy-8: bad signature reported before expiry ------------------------

test("[unhappy-8] an expired value for another user with a bad signature reports the signature", () => {
  const value = signState(OTHER_SECRET, { ...BASE, issuedAt: T, nonce: "n1" });
  assert.deepEqual(verifyState(SECRET, value, "user_2", T + 86400000), {
    ok: false,
    reason: "bad-signature",
  });
});

test("[unhappy-8] a bad signature is reported before a user mismatch inside the window", () => {
  const value = signState(OTHER_SECRET, { ...BASE, issuedAt: T, nonce: "n1" });
  assert.deepEqual(verifyState(SECRET, value, "user_2", T), {
    ok: false,
    reason: "bad-signature",
  });
});

// ---- unhappy-9: empty secret in verifyState ---------------------------------

test("[unhappy-9] verifyState with an empty secret throws a TypeError", () => {
  assert.throws(() => verifyState("", standard(), "user_1", T), TypeError);
});

test("[unhappy-9] verifyState with an empty secret throws even for an undefined value", () => {
  assert.throws(() => verifyState("", undefined, "user_1", T), TypeError);
});

// ---- unhappy-10: expected user mismatch --------------------------------------

test("[unhappy-10] another user, or the same id in other case or with a space, is wrong-user", () => {
  const value = standard();
  for (const expected of ["user_2", "USER_1", "user_1 "]) {
    assert.deepEqual(
      verifyState(SECRET, value, expected, T),
      { ok: false, reason: "wrong-user" },
      JSON.stringify(expected),
    );
  }
});

test("[unhappy-10] an empty expected user id is wrong-user", () => {
  assert.deepEqual(verifyState(SECRET, standard(), "", T), {
    ok: false,
    reason: "wrong-user",
  });
});

// ---- unhappy-11: expiry before user mismatch ---------------------------------

test("[unhappy-11] an expired value for another user is expired", () => {
  assert.deepEqual(verifyState(SECRET, standard(), "user_2", T + 600001), {
    ok: false,
    reason: "expired",
  });
});

test("[unhappy-11] at the last valid instant another user is wrong-user, not expired", () => {
  assert.deepEqual(verifyState(SECRET, standard(), "user_2", T + 600000), {
    ok: false,
    reason: "wrong-user",
  });
});
