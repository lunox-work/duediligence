import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";

import { signState, verifyState } from "../src/jira/state.js";

/**
 * The signed OAuth `state` for the Jira connect flow. See spec.md: the wire
 * format is `base64url(JSON payload) "." base64url(HMAC-SHA256)`, no padding.
 */

const SECRET = "0123456789abcdef0123456789abcdef";
const OTHER_SECRET = "another-secret-another-secret-xx";
const BASE = {
  organizationId: "org_1",
  userId: "user_1",
  returnTo: "/settings/jira",
} as const;
const T = 1700000000000;

/** signState(SECRET, { ...BASE, issuedAt: T, nonce: "AAAAAAAAAAAAAAAAAAAAAA" }) */
const KNOWN =
  "eyJvcmdhbml6YXRpb25JZCI6Im9yZ18xIiwidXNlcklkIjoidXNlcl8xIiwicmV0dXJuVG8iOiIvc2V0dGluZ3MvamlyYSIsImlzc3VlZEF0IjoxNzAwMDAwMDAwMDAwLCJub25jZSI6IkFBQUFBQUFBQUFBQUFBQUFBQUFBQUEifQ.Urh3QevT-f-UKuDamXCEWtrqVSKKyJdzD09Kp0ROuIA";
const KNOWN_JSON =
  '{"organizationId":"org_1","userId":"user_1","returnTo":"/settings/jira","issuedAt":1700000000000,"nonce":"AAAAAAAAAAAAAAAAAAAAAA"}';

const STATE_KEYS = ["issuedAt", "nonce", "organizationId", "returnTo", "userId"];
const BASE64URL =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** base64url (no padding) of the UTF-8 bytes of `text`. */
function encode(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

/** base64url (no padding) of HMAC-SHA256(secret, payload). */
function hmac(secret: string, payload: string): string {
  return createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(Buffer.from(payload, "ascii"))
    .digest("base64url");
}

/** A correctly signed value whose payload is exactly `json`. */
function signedRaw(json: string, secret: string = SECRET): string {
  const payload = encode(json);
  return `${payload}.${hmac(secret, payload)}`;
}

/** Splits a value at its last `.`. */
function split(value: string): { payload: string; signature: string } {
  const at = value.lastIndexOf(".");
  return { payload: value.slice(0, at), signature: value.slice(at + 1) };
}

function payloadText(value: string): string {
  return Buffer.from(split(value).payload, "base64url").toString("utf8");
}

function payloadOf(value: string): Record<string, unknown> {
  return JSON.parse(payloadText(value)) as Record<string, unknown>;
}

/** The fixture most scenarios start from. */
function signedN1(secret: string = SECRET): string {
  return signState(secret, { ...BASE, issuedAt: T, nonce: "n1" });
}

const okN1 = {
  ok: true,
  state: { ...BASE, issuedAt: T, nonce: "n1" },
} as const;

// ---- @happy 5: a fully specified state signs to a known value --------------

test("[happy-5] a fully specified state signs to the known value", () => {
  assert.equal(
    signState(SECRET, {
      organizationId: "org_1",
      userId: "user_1",
      returnTo: "/settings/jira",
      issuedAt: 1700000000000,
      nonce: "AAAAAAAAAAAAAAAAAAAAAA",
    }),
    KNOWN,
  );
});

test("[happy-5] the payload is the fixed-order JSON and the signature a 43-char unpadded HMAC", () => {
  const value = signState(SECRET, {
    ...BASE,
    issuedAt: T,
    nonce: "AAAAAAAAAAAAAAAAAAAAAA",
  });
  const { payload, signature } = split(value);
  assert.equal(payloadText(value), KNOWN_JSON);
  assert.match(payload, /^[A-Za-z0-9_-]+$/);
  assert.equal(signature.length, 43);
  assert.match(signature, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(signature, hmac(SECRET, payload));
});

// ---- @happy 6: deterministic when issuedAt and nonce are given -------------

test("[happy-6] signing the same five fields twice gives the same string", () => {
  assert.equal(signedN1(), signedN1());
});

test("[happy-6] the input's property order does not change the signed value", () => {
  const reordered = signState(SECRET, {
    nonce: "n1",
    issuedAt: T,
    returnTo: "/settings/jira",
    userId: "user_1",
    organizationId: "org_1",
  });
  assert.equal(reordered, signedN1());
  assert.equal(
    payloadText(reordered),
    '{"organizationId":"org_1","userId":"user_1","returnTo":"/settings/jira","issuedAt":1700000000000,"nonce":"n1"}',
  );
});

// ---- @happy 7: the signature depends on the secret -------------------------

test("[happy-7] another secret keeps the payload and gives the known signature", () => {
  const state = {
    ...BASE,
    issuedAt: T,
    nonce: "AAAAAAAAAAAAAAAAAAAAAA",
  };
  const other = split(signState(OTHER_SECRET, state));
  assert.equal(other.payload, split(KNOWN).payload);
  assert.equal(other.signature, "iampN5VG6Lx4428tXUfkqkWvs4GMwZpD6l2F9XUs23o");
});

test("[happy-7] a secret differing in one character signs to that secret's HMAC", () => {
  const nearly = "0123456789abcdef0123456789abcdeg";
  const value = signedN1(nearly);
  const { payload, signature } = split(value);
  assert.equal(payload, split(signedN1()).payload);
  assert.equal(signature, hmac(nearly, payload));
  assert.notEqual(signature, split(signedN1()).signature);
});

// ---- @happy 8: an omitted nonce is 9 fresh random bytes --------------------

test("[happy-8] an omitted nonce is a fresh 12-char base64url value each call", () => {
  const first = signState(SECRET, { ...BASE, issuedAt: T });
  const second = signState(SECRET, { ...BASE, issuedAt: T });
  const nonce1 = payloadOf(first).nonce;
  const nonce2 = payloadOf(second).nonce;
  assert.equal(typeof nonce1, "string");
  assert.equal(typeof nonce2, "string");
  assert.match(nonce1 as string, /^[A-Za-z0-9_-]{12}$/);
  assert.match(nonce2 as string, /^[A-Za-z0-9_-]{12}$/);
  assert.notEqual(nonce1, nonce2);
  assert.notEqual(first, second);
});

test("[happy-8] a generated nonce decodes to 9 bytes and verifies as the state's nonce", () => {
  const value = signState(SECRET, { ...BASE, issuedAt: T });
  const nonce = payloadOf(value).nonce as string;
  assert.equal(Buffer.from(nonce, "base64url").length, 9);
  assert.deepEqual(verifyState(SECRET, value, "user_1", T), {
    ok: true,
    state: { ...BASE, issuedAt: T, nonce },
  });
});

// ---- @happy 9: an omitted issuedAt is the current time ---------------------

test("[happy-9] an omitted issuedAt is Date.now()", (t) => {
  t.mock.method(Date, "now", () => T);
  const value = signState(SECRET, BASE);
  const issuedAt = payloadOf(value).issuedAt;
  assert.ok(Number.isInteger(issuedAt));
  assert.equal(issuedAt, T);
});

test("[happy-9] an explicit issuedAt of 0 is kept, not replaced by the clock", (t) => {
  t.mock.method(Date, "now", () => T);
  const value = signState(SECRET, { ...BASE, issuedAt: 0, nonce: "n1" });
  assert.equal(payloadOf(value).issuedAt, 0);
});

// ---- @boundary 5: properties outside the five fields are not signed -------

test("[boundary-5] extra input properties are left out of the payload", () => {
  const value = signState(SECRET, {
    ...BASE,
    issuedAt: T,
    nonce: "n1",
    extra: "x",
  } as never);
  assert.deepEqual(Object.keys(payloadOf(value)).sort(), STATE_KEYS);
});

test("[boundary-5] an extra input property does not change the signed value", () => {
  const value = signState(SECRET, {
    ...BASE,
    issuedAt: T,
    nonce: "n1",
    admin: true,
  } as never);
  assert.equal(value, signedN1());
});

// ---- @boundary 6: returnTo is carried verbatim ----------------------------

test("[boundary-6] an empty or non-ASCII returnTo round-trips verbatim", () => {
  for (const returnTo of ["", "/boards?q=ä&x=1#top"]) {
    const value = signState(SECRET, { ...BASE, returnTo, issuedAt: T, nonce: "n1" });
    const result = verifyState(SECRET, value, "user_1", T);
    assert.equal(result.ok, true, `expected ${JSON.stringify(returnTo)} to verify`);
    assert.equal(result.ok && result.state.returnTo, returnTo);
  }
});

test("[boundary-6] an absolute or dotted returnTo round-trips verbatim", () => {
  for (const returnTo of ["https://evil.example/", "/a.b.c"]) {
    const value = signState(SECRET, { ...BASE, returnTo, issuedAt: T, nonce: "n1" });
    const result = verifyState(SECRET, value, "user_1", T);
    assert.equal(result.ok, true, `expected ${JSON.stringify(returnTo)} to verify`);
    assert.equal(result.ok && result.state.returnTo, returnTo);
  }
});

// ---- @boundary 7: signState does not validate its input -------------------

test("[boundary-7] empty secret, ids and nonce sign without throwing and verify", () => {
  const emptySecret = signState("", { ...BASE, issuedAt: T, nonce: "n1" });
  assert.equal(typeof emptySecret, "string");
  assert.equal(verifyState("", emptySecret, "user_1", T).ok, true);

  assert.deepEqual(
    verifyState(
      SECRET,
      signState(SECRET, { ...BASE, organizationId: "", issuedAt: T, nonce: "n1" }),
      "user_1",
      T,
    ),
    {
      ok: true,
      state: {
        organizationId: "",
        userId: "user_1",
        returnTo: "/settings/jira",
        issuedAt: T,
        nonce: "n1",
      },
    },
  );

  const emptyUser = signState(SECRET, { ...BASE, userId: "", issuedAt: T, nonce: "n1" });
  assert.equal(verifyState(SECRET, emptyUser, "", T).ok, true);

  assert.deepEqual(
    verifyState(SECRET, signState(SECRET, { ...BASE, issuedAt: T, nonce: "" }), "user_1", T),
    { ok: true, state: { ...BASE, issuedAt: T, nonce: "" } },
  );
});

test("[boundary-7] odd issuedAt values sign without throwing and verify as expired or malformed", () => {
  for (const issuedAt of [-1, 1.5]) {
    let value = "";
    assert.doesNotThrow(() => {
      value = signState(SECRET, { ...BASE, issuedAt, nonce: "n1" });
    });
    assert.deepEqual(
      verifyState(SECRET, value, "user_1", T),
      { ok: false, reason: "expired" },
      `issuedAt ${issuedAt}`,
    );
  }
  for (const issuedAt of [Number.NaN, Number.POSITIVE_INFINITY]) {
    let value = "";
    assert.doesNotThrow(() => {
      value = signState(SECRET, { ...BASE, issuedAt, nonce: "n1" });
    });
    assert.equal(payloadOf(value).issuedAt, null);
    assert.deepEqual(
      verifyState(SECRET, value, "user_1", T),
      { ok: false, reason: "malformed" },
      `issuedAt ${issuedAt}`,
    );
  }
});

// ---- @boundary 8: no length limit on the value ----------------------------

test("[boundary-8] a 4001-character returnTo signs to a 5507-character value that verifies", () => {
  const value = signState(SECRET, {
    ...BASE,
    returnTo: "/" + "a".repeat(4000),
    issuedAt: T,
    nonce: "n1",
  });
  assert.equal(value.length, 5507);
  assert.equal(verifyState(SECRET, value, "user_1", T).ok, true);
});

test("[boundary-8] a long returnTo comes back intact", () => {
  const returnTo = "/" + "a".repeat(4000);
  const value = signState(SECRET, { ...BASE, returnTo, issuedAt: T, nonce: "n1" });
  assert.deepEqual(verifyState(SECRET, value, "user_1", T), {
    ok: true,
    state: { ...BASE, returnTo, issuedAt: T, nonce: "n1" },
  });
});

// ---- @happy 10: a freshly signed value verifies ----------------------------

test("[happy-10] a freshly signed value verifies to its five fields", () => {
  assert.deepEqual(verifyState(SECRET, signedN1(), "user_1", T + 1000), {
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

test("[happy-10] the known wire-format value verifies", () => {
  assert.deepEqual(verifyState(SECRET, KNOWN, "user_1", T + 1000), {
    ok: true,
    state: { ...BASE, issuedAt: T, nonce: "AAAAAAAAAAAAAAAAAAAAAA" },
  });
});

// ---- @happy 11: now defaults to the current time ---------------------------

test("[happy-11] verifyState without now uses the current time", (t) => {
  t.mock.method(Date, "now", () => T + 1000);
  const value = signState(SECRET, BASE);
  assert.equal(verifyState(SECRET, value, "user_1").ok, true);
});

test("[happy-11] verifyState without now judges expiry against Date.now()", (t) => {
  t.mock.method(Date, "now", () => T + 600001);
  assert.deepEqual(verifyState(SECRET, signedN1(), "user_1"), {
    ok: false,
    reason: "expired",
  });
});

// ---- @boundary 9: verification is stateless -------------------------------

test("[boundary-9] the same value verifies twice with equal results", () => {
  const value = signedN1();
  const first = verifyState(SECRET, value, "user_1", T);
  const second = verifyState(SECRET, value, "user_1", T);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(first, second);
});

test("[boundary-9] a value verified once still verifies at the end of its window", () => {
  const value = signedN1();
  assert.deepEqual(verifyState(SECRET, value, "user_1", T), okN1);
  assert.deepEqual(verifyState(SECRET, value, "user_1", T + 600000), okN1);
});

// ---- @boundary 10: age and skew boundaries ---------------------------------

test("[boundary-10] now at T, at T + 600000 and at T - 60000 is inside the window", () => {
  const value = signedN1();
  for (const now of [T, T + 600000, T - 60000]) {
    assert.deepEqual(verifyState(SECRET, value, "user_1", now), okN1, `now ${now}`);
  }
});

test("[boundary-10] one millisecond past either edge is expired", () => {
  const value = signedN1();
  for (const now of [T + 600001, T + 86400000, T - 60001]) {
    assert.deepEqual(
      verifyState(SECRET, value, "user_1", now),
      { ok: false, reason: "expired" },
      `now ${now}`,
    );
  }
});

test("[boundary-10] a NaN now is never expired", () => {
  assert.deepEqual(verifyState(SECRET, signedN1(), "user_1", Number.NaN), okN1);
});

// ---- @unhappy 2: shape failures --------------------------------------------

test("[unhappy-2] a value with no payload/signature split is malformed", () => {
  for (const value of [undefined, "", "abc", ".", ".abc"]) {
    assert.deepEqual(
      verifyState(SECRET, value, "user_1", T),
      { ok: false, reason: "malformed" },
      `value ${JSON.stringify(value)}`,
    );
  }
});

test("[unhappy-2] any other shape is judged by its signature", () => {
  for (const value of [
    "abc.",
    "a.b.c",
    "a+b.c",
    "ab=.c",
    "a".repeat(4000) + "." + "b".repeat(96),
  ]) {
    assert.deepEqual(
      verifyState(SECRET, value, "user_1", T),
      { ok: false, reason: "bad-signature" },
      `value ${JSON.stringify(value.slice(0, 20))}`,
    );
  }
});

test("[unhappy-2] whitespace around a valid value is a bad signature", () => {
  const value = signedN1();
  assert.deepEqual(verifyState(SECRET, " " + value, "user_1", T), {
    ok: false,
    reason: "bad-signature",
  });
  assert.deepEqual(verifyState(SECRET, value + "\n", "user_1", T), {
    ok: false,
    reason: "bad-signature",
  });
});

// ---- @unhappy 3: a signed payload that is not a state is malformed --------

test("[unhappy-3] a signed payload that is not a JSON object is malformed", () => {
  for (const json of ["not json", '"a string"', "[1,2]", "null"]) {
    assert.deepEqual(
      verifyState(SECRET, signedRaw(json), "user_1", T),
      { ok: false, reason: "malformed" },
      `payload ${json}`,
    );
  }
});

test("[unhappy-3] a signed payload with a missing or mistyped field is malformed", () => {
  for (const json of [
    '{"userId":"user_1","returnTo":"/","issuedAt":1700000000000,"nonce":"n1"}',
    '{"organizationId":"org_1","userId":7,"returnTo":"/","issuedAt":1700000000000,"nonce":"n1"}',
    '{"organizationId":"org_1","userId":"user_1","returnTo":null,"issuedAt":1700000000000,"nonce":"n1"}',
    '{"organizationId":"org_1","userId":"user_1","returnTo":"/","issuedAt":"1700000000000","nonce":"n1"}',
  ]) {
    assert.deepEqual(
      verifyState(SECRET, signedRaw(json), "user_1", T),
      { ok: false, reason: "malformed" },
      `payload ${json}`,
    );
  }
});

// ---- @boundary 11: signed payloads are checked for types only -------------

test("[boundary-11] empty strings and a fractional issuedAt in a signed payload verify", () => {
  const cases: Array<[string, object]> = [
    [
      '{"organizationId":"","userId":"user_1","returnTo":"/","issuedAt":1700000000000,"nonce":"n1"}',
      { organizationId: "", userId: "user_1", returnTo: "/", issuedAt: 1700000000000, nonce: "n1" },
    ],
    [
      '{"organizationId":"org_1","userId":"user_1","returnTo":"/","issuedAt":1700000000000,"nonce":""}',
      { organizationId: "org_1", userId: "user_1", returnTo: "/", issuedAt: 1700000000000, nonce: "" },
    ],
    [
      '{"organizationId":"org_1","userId":"user_1","returnTo":"/","issuedAt":1700000000000.5,"nonce":"n1"}',
      { organizationId: "org_1", userId: "user_1", returnTo: "/", issuedAt: 1700000000000.5, nonce: "n1" },
    ],
  ];
  for (const [json, state] of cases) {
    assert.deepEqual(
      verifyState(SECRET, signedRaw(json), "user_1", T),
      { ok: true, state },
      `payload ${json}`,
    );
  }
});

test("[boundary-11] a signed fractional or negative issuedAt far from now is expired, not malformed", () => {
  for (const json of [
    '{"organizationId":"org_1","userId":"user_1","returnTo":"/","issuedAt":1.5,"nonce":"n1"}',
    '{"organizationId":"org_1","userId":"user_1","returnTo":"/","issuedAt":-1,"nonce":"n1"}',
  ]) {
    assert.deepEqual(
      verifyState(SECRET, signedRaw(json), "user_1", T),
      { ok: false, reason: "expired" },
      `payload ${json}`,
    );
  }
});

// ---- @boundary 12: extra keys in a signed payload are dropped -------------

test("[boundary-12] an extra key in a signed payload is dropped from the state", () => {
  const result = verifyState(
    SECRET,
    signedRaw(
      '{"organizationId":"org_1","userId":"user_1","returnTo":"/","issuedAt":1700000000000,"nonce":"n1","admin":true}',
    ),
    "user_1",
    T,
  );
  assert.equal(result.ok, true);
  assert.ok(result.ok);
  assert.deepEqual(Object.keys(result.state).sort(), STATE_KEYS);
});

test("[boundary-12] extra keys anywhere in a signed payload leave exactly the five fields", () => {
  assert.deepEqual(
    verifyState(
      SECRET,
      signedRaw(
        '{"admin":true,"organizationId":"org_1","userId":"user_1","role":"owner","returnTo":"/","issuedAt":1700000000000,"nonce":"n1"}',
      ),
      "user_1",
      T,
    ),
    {
      ok: true,
      state: {
        organizationId: "org_1",
        userId: "user_1",
        returnTo: "/",
        issuedAt: 1700000000000,
        nonce: "n1",
      },
    },
  );
});

// ---- @unhappy 4: signed under another secret ------------------------------

test("[unhappy-4] a value signed under another secret is a bad signature", () => {
  assert.deepEqual(verifyState(SECRET, signedN1(OTHER_SECRET), "user_1", T), {
    ok: false,
    reason: "bad-signature",
  });
});

test("[unhappy-4] a secret differing only by a trailing character is a bad signature", () => {
  assert.deepEqual(verifyState(SECRET, signedN1(SECRET + " "), "user_1", T), {
    ok: false,
    reason: "bad-signature",
  });
});

// ---- @unhappy 5: a rewritten payload keeps the old signature --------------

test("[unhappy-5] a payload rewritten to another user is a bad signature", () => {
  const { signature } = split(signedN1());
  const p2 = encode(
    JSON.stringify({ ...BASE, userId: "user_2", issuedAt: T, nonce: "n1" }),
  );
  assert.deepEqual(verifyState(SECRET, `${p2}.${signature}`, "user_2", T), {
    ok: false,
    reason: "bad-signature",
  });
});

test("[unhappy-5] a payload rewritten to another returnTo is a bad signature", () => {
  const { signature } = split(signedN1());
  const p2 = encode(
    JSON.stringify({
      ...BASE,
      returnTo: "https://evil.example/",
      issuedAt: T,
      nonce: "n1",
    }),
  );
  assert.deepEqual(verifyState(SECRET, `${p2}.${signature}`, "user_1", T), {
    ok: false,
    reason: "bad-signature",
  });
});

// ---- @unhappy 6: a damaged signature ---------------------------------------

/** `signature` with its last character replaced by one with different bits. */
function changeLast(signature: string): string {
  const last = signature.slice(-1);
  const index = BASE64URL.indexOf(last);
  return signature.slice(0, -1) + BASE64URL.charAt((index + 32) % 64);
}

test("[unhappy-6] a signature with its last character changed or dropped is bad", () => {
  const { payload, signature } = split(signedN1());
  for (const damaged of [changeLast(signature), signature.slice(0, -1)]) {
    assert.deepEqual(
      verifyState(SECRET, `${payload}.${damaged}`, "user_1", T),
      { ok: false, reason: "bad-signature" },
      `signature ${damaged}`,
    );
  }
});

test("[unhappy-6] a signature of the wrong length is bad, without throwing", () => {
  const { payload, signature } = split(signedN1());
  for (const damaged of [signature + "A", "A"]) {
    assert.deepEqual(
      verifyState(SECRET, `${payload}.${damaged}`, "user_1", T),
      { ok: false, reason: "bad-signature" },
      `signature ${damaged}`,
    );
  }
});

// ---- @unhappy 7: an expired value with a bad signature --------------------

test("[unhappy-7] an expired value for another user with a bad signature reports the signature", () => {
  assert.deepEqual(
    verifyState(SECRET, signedN1(OTHER_SECRET), "user_2", T + 86400000),
    { ok: false, reason: "bad-signature" },
  );
});

test("[unhappy-7] a too-far-future or non-state payload with a bad signature reports the signature", () => {
  assert.deepEqual(
    verifyState(SECRET, signedN1(OTHER_SECRET), "user_1", T - 86400000),
    { ok: false, reason: "bad-signature" },
  );
  assert.deepEqual(
    verifyState(SECRET, signedRaw("not json", OTHER_SECRET), "user_1", T),
    { ok: false, reason: "bad-signature" },
  );
});

// ---- @unhappy 8: an empty secret is an ordinary secret --------------------

test("[unhappy-8] verifying under an empty secret does not throw and is a bad signature", () => {
  const value = signedN1();
  assert.doesNotThrow(() => verifyState("", value, "user_1", T));
  assert.deepEqual(verifyState("", value, "user_1", T), {
    ok: false,
    reason: "bad-signature",
  });
});

test("[unhappy-8] a value signed under an empty secret is a bad signature under SECRET", () => {
  assert.deepEqual(verifyState(SECRET, signedN1(""), "user_1", T), {
    ok: false,
    reason: "bad-signature",
  });
});

// ---- @unhappy 9: the expected user does not match exactly -----------------

test("[unhappy-9] another user gets wrong-user", () => {
  assert.deepEqual(verifyState(SECRET, signedN1(), "user_2", T), {
    ok: false,
    reason: "wrong-user",
  });
});

test("[unhappy-9] the user comparison is exact: case, whitespace and empty all mismatch", () => {
  const value = signedN1();
  for (const expected of ["USER_1", "user_1 ", ""]) {
    assert.deepEqual(
      verifyState(SECRET, value, expected, T),
      { ok: false, reason: "wrong-user" },
      `expected user ${JSON.stringify(expected)}`,
    );
  }
});

test("[unhappy-9] another user at the last valid moment is still wrong-user", () => {
  assert.deepEqual(verifyState(SECRET, signedN1(), "user_2", T + 600000), {
    ok: false,
    reason: "wrong-user",
  });
});

// ---- @unhappy 10: expiry is reported before the user mismatch -------------

test("[unhappy-10] an expired value for another user reports expired", () => {
  assert.deepEqual(verifyState(SECRET, signedN1(), "user_2", T + 600001), {
    ok: false,
    reason: "expired",
  });
});

test("[unhappy-10] a too-far-future value for another user reports expired", () => {
  assert.deepEqual(verifyState(SECRET, signedN1(), "user_2", T - 60001), {
    ok: false,
    reason: "expired",
  });
});
