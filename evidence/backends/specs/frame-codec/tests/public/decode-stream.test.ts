import { test } from "node:test";
import assert from "node:assert/strict";
import { decode } from "../../src/index.js";

test("[happy-2] returns frames in order while ignoring surrounding noise", () => {
  const stream = Uint8Array.of(
    0x11, 0x7f, 0x7d, 0x00,
    0x7e, 0x01, 0x00, 0x02, 0x10, 0x20, 0xcd, 0x7f,
    0x42, 0xff, 0x7d, 0x7f,
    0x7e, 0x7d, 0x5e, 0x00, 0x03, 0x7d, 0x5d, 0x7d, 0x5f, 0x00, 0x83, 0x7f,
    0x99, 0x7f,
  );
  assert.deepEqual(decode(stream), {
    frames: [
      { type: 0x01, payload: Uint8Array.of(0x10, 0x20) },
      { type: 0x7e, payload: Uint8Array.of(0x7d, 0x7f, 0x00) },
    ],
    errors: [],
    leftover: new Uint8Array(),
  });
});

test("[happy-2] decodes adjacent empty frames with the minimum and maximum valid types", () => {
  assert.deepEqual(decode(Uint8Array.of(
    0x7e, 0x00, 0x00, 0x00, 0x00, 0x7f,
    0x7e, 0xfe, 0x00, 0x00, 0x02, 0x7f,
  )), {
    frames: [
      { type: 0x00, payload: new Uint8Array() },
      { type: 0xfe, payload: new Uint8Array() },
    ],
    errors: [],
    leftover: new Uint8Array(),
  });
});

test("[happy-2] an empty stream or noise alone produces no frames or errors", () => {
  for (const stream of [new Uint8Array(), Uint8Array.of(0x00, 0x7d, 0x5f, 0x7f, 0xff)]) {
    assert.deepEqual(decode(stream), {
      frames: [], errors: [], leftover: new Uint8Array(),
    });
  }
});

test("[boundary-2] retains and resumes every proper prefix of an ordinary frame", () => {
  const frame = Uint8Array.of(0x7e, 0x01, 0x00, 0x02, 0x10, 0x20, 0xcd, 0x7f);
  for (let cut = 1; cut < frame.length; cut++) {
    const prefix = frame.slice(0, cut);
    const first = decode(Uint8Array.of(0x10, 0x20, ...prefix));
    assert.deepEqual(first, { frames: [], errors: [], leftover: prefix });
    assert.deepEqual(decode(Uint8Array.of(...first.leftover, ...frame.slice(cut))), {
      frames: [{ type: 0x01, payload: Uint8Array.of(0x10, 0x20) }],
      errors: [],
      leftover: new Uint8Array(),
    });
  }
});

test("[boundary-2] resumes splits inside escapes in the type, length, payload and check", () => {
  // Payload: 0x7D, 123 zero bytes, 0x0B. Its length and check are both 0x7D.
  const frame = Uint8Array.of(
    0x7e, 0x7d, 0x5e, 0x00, 0x7d, 0x5d,
    0x7d, 0x5d, ...new Uint8Array(123), 0x0b,
    0x7d, 0x5d, 0x7f,
  );
  const payload = new Uint8Array(125);
  payload[0] = 0x7d;
  payload[124] = 0x0b;
  for (let cut = 1; cut < frame.length; cut++) {
    const prefix = frame.slice(0, cut);
    const first = decode(prefix);
    assert.deepEqual(first, { frames: [], errors: [], leftover: prefix });
    assert.deepEqual(decode(Uint8Array.of(...first.leftover, ...frame.slice(cut))), {
      frames: [{ type: 0x7e, payload }], errors: [], leftover: new Uint8Array(),
    });
  }
});

test("[boundary-2] returns completed frames while retaining only the next partial frame", () => {
  const partial = Uint8Array.of(0x7e, 0x02, 0x00, 0x01, 0x30);
  const first = decode(Uint8Array.of(
    0x7e, 0x01, 0x00, 0x00, 0xff, 0x7f, 0x55, ...partial,
  ));
  assert.deepEqual(first, {
    frames: [{ type: 0x01, payload: new Uint8Array() }],
    errors: [],
    leftover: partial,
  });
  assert.deepEqual(decode(Uint8Array.of(...first.leftover, 0xcd, 0x7f)), {
    frames: [{ type: 0x02, payload: Uint8Array.of(0x30) }],
    errors: [],
    leftover: new Uint8Array(),
  });
});

test("[boundary-2] a completed frame followed by noise leaves no partial frame", () => {
  assert.deepEqual(decode(Uint8Array.of(
    0x7e, 0x01, 0x00, 0x00, 0xff, 0x7f, 0x00, 0x7d,
  )), {
    frames: [{ type: 0x01, payload: new Uint8Array() }],
    errors: [],
    leftover: new Uint8Array(),
  });
});

test("[boundary-3] decodes escaped end bytes in both the payload and the check", () => {
  assert.deepEqual(decode(Uint8Array.of(
    0x7e, 0x01, 0x00, 0x01, 0x7d, 0x5f, 0x7d, 0x5f, 0x7f,
    0x7e, 0x02, 0x00, 0x01, 0x30, 0xcd, 0x7f,
  )), {
    frames: [
      { type: 0x01, payload: Uint8Array.of(0x7f) },
      { type: 0x02, payload: Uint8Array.of(0x30) },
    ],
    errors: [],
    leftover: new Uint8Array(),
  });
});

test("[boundary-3] an escaped escape followed by 0x5F counts as two payload bytes", () => {
  assert.deepEqual(decode(Uint8Array.of(
    0x7e, 0x01, 0x00, 0x02, 0x7d, 0x5d, 0x5f, 0x21, 0x7f,
  )), {
    frames: [{ type: 0x01, payload: Uint8Array.of(0x7d, 0x5f) }],
    errors: [],
    leftover: new Uint8Array(),
  });
});

test("[boundary-3] escaped start, end and escape bytes all remain payload", () => {
  assert.deepEqual(decode(Uint8Array.of(
    0x7e, 0x01, 0x00, 0x03, 0x7d, 0x5d, 0x7d, 0x5e, 0x7d, 0x5f, 0x82, 0x7f,
  )), {
    frames: [{ type: 0x01, payload: Uint8Array.of(0x7d, 0x7e, 0x7f) }],
    errors: [],
    leftover: new Uint8Array(),
  });
});

test("[boundary-3] uses both big-endian length bytes for a 256-byte payload", () => {
  const frame = new Uint8Array(262);
  frame.set([0x7e, 0x01, 0x01, 0x00]);
  frame.set([0xfe, 0x7f], frame.length - 2);
  assert.deepEqual(decode(frame), {
    frames: [{ type: 0x01, payload: new Uint8Array(256) }],
    errors: [],
    leftover: new Uint8Array(),
  });
});
