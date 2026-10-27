import { test } from "node:test";
import assert from "node:assert/strict";
import { decode } from "../../src/index.js";

test("[unhappy-2] reports a wrong check at the start offset and recovers the next frame", () => {
  assert.deepEqual(decode(Uint8Array.of(
    0x44, 0x55,
    0x7e, 0x01, 0x00, 0x02, 0x10, 0x20, 0xcc, 0x7f,
    0x7e, 0x02, 0x00, 0x01, 0x30, 0xcd, 0x7f,
  )), {
    frames: [{ type: 0x02, payload: Uint8Array.of(0x30) }],
    errors: [{ offset: 2, code: "check" }],
    leftover: new Uint8Array(),
  });
});

test("[unhappy-2] rejects a wrong check in an empty frame ending exactly at input end", () => {
  assert.deepEqual(decode(Uint8Array.of(0x7e, 0x01, 0x00, 0x00, 0x00, 0x7f)), {
    frames: [],
    errors: [{ offset: 0, code: "check" }],
    leftover: new Uint8Array(),
  });
});

test("[unhappy-3] an unescaped start interrupts a payload and begins an intact frame", () => {
  assert.deepEqual(decode(Uint8Array.of(
    0x44, 0x7e, 0x01, 0x00, 0x05, 0x10,
    0x7e, 0x02, 0x00, 0x01, 0x30, 0xcd, 0x7f,
  )), {
    frames: [{ type: 0x02, payload: Uint8Array.of(0x30) }],
    errors: [{ offset: 1, code: "truncated" }],
    leftover: new Uint8Array(),
  });
});

test("[unhappy-3] adjacent starts truncate the first frame and preserve the second", () => {
  assert.deepEqual(decode(Uint8Array.of(
    0x7e, 0x7e, 0x01, 0x00, 0x00, 0xff, 0x7f,
  )), {
    frames: [{ type: 0x01, payload: new Uint8Array() }],
    errors: [{ offset: 0, code: "truncated" }],
    leftover: new Uint8Array(),
  });
});

test("[unhappy-3] a new start in place of the end is a truncation", () => {
  assert.deepEqual(decode(Uint8Array.of(
    0x7e, 0x01, 0x00, 0x00, 0xff,
    0x7e, 0x02, 0x00, 0x01, 0x30, 0xcd, 0x7f,
  )), {
    frames: [{ type: 0x02, payload: Uint8Array.of(0x30) }],
    errors: [{ offset: 0, code: "truncated" }],
    leftover: new Uint8Array(),
  });
});

test("[unhappy-3] a final interrupting start is retained as a new incomplete frame", () => {
  assert.deepEqual(decode(Uint8Array.of(0x55, 0x7e, 0x01, 0x00, 0x7e)), {
    frames: [],
    errors: [{ offset: 1, code: "truncated" }],
    leftover: Uint8Array.of(0x7e),
  });
});

test("[unhappy-4] reports a missing end and recovers an intact following frame", () => {
  assert.deepEqual(decode(Uint8Array.of(
    0x44, 0x55, 0x7e, 0x01, 0x00, 0x00, 0xff, 0x00,
    0x7e, 0x02, 0x00, 0x01, 0x30, 0xcd, 0x7f,
  )), {
    frames: [{ type: 0x02, payload: Uint8Array.of(0x30) }],
    errors: [{ offset: 2, code: "framing" }],
    leftover: new Uint8Array(),
  });
});

test("[unhappy-4] a wrong final byte is framing but an absent end is incomplete", () => {
  assert.deepEqual(decode(Uint8Array.of(0x7e, 0x01, 0x00, 0x00, 0xff, 0x01)), {
    frames: [],
    errors: [{ offset: 0, code: "framing" }],
    leftover: new Uint8Array(),
  });
  const incomplete = Uint8Array.of(0x7e, 0x01, 0x00, 0x00, 0xff);
  assert.deepEqual(decode(incomplete), {
    frames: [], errors: [], leftover: incomplete,
  });
});

test("[unhappy-5] reports a bad payload escape and recovers the next frame", () => {
  assert.deepEqual(decode(Uint8Array.of(
    0x44, 0x7e, 0x01, 0x00, 0x01, 0x7d, 0x00, 0xfd, 0x7f,
    0x7e, 0x02, 0x00, 0x01, 0x30, 0xcd, 0x7f,
  )), {
    frames: [{ type: 0x02, payload: Uint8Array.of(0x30) }],
    errors: [{ offset: 1, code: "escape" }],
    leftover: new Uint8Array(),
  });
});

test("[unhappy-5] rejects noncanonical escape suffixes even when the suffix is last", () => {
  for (const suffix of [0x00, 0x5c, 0x60, 0x7d, 0xff]) {
    assert.deepEqual(decode(Uint8Array.of(0x7e, 0x01, 0x00, 0x01, 0x7d, suffix)), {
      frames: [],
      errors: [{ offset: 0, code: "escape" }],
      leftover: new Uint8Array(),
    });
  }
});

test("[unhappy-5] finds an intact frame before the damaged frame's apparent end", () => {
  assert.deepEqual(decode(Uint8Array.of(
    0x7e, 0x01, 0x00, 0x08, 0x7d, 0x00,
    0x7e, 0x02, 0x00, 0x01, 0x30, 0xcd, 0x7f,
    0x11, 0x22, 0x7f,
  )), {
    frames: [{ type: 0x02, payload: Uint8Array.of(0x30) }],
    errors: [{ offset: 0, code: "escape" }],
    leftover: new Uint8Array(),
  });
});

test("[unhappy-5] validates escapes in the type, either length byte, and the check", () => {
  const prefixes = [
    [0x7e],
    [0x7e, 0x01],
    [0x7e, 0x01, 0x00],
    [0x7e, 0x01, 0x00, 0x00],
  ];
  for (const prefix of prefixes) {
    assert.deepEqual(decode(Uint8Array.of(...prefix, 0x7d, 0x00, 0x7f)), {
      frames: [],
      errors: [{ offset: 0, code: "escape" }],
      leftover: new Uint8Array(),
    });
  }
});

test("[unhappy-5] a trailing escape is incomplete until an invalid suffix arrives", () => {
  const partial = Uint8Array.of(0x7e, 0x01, 0x00, 0x01, 0x7d);
  const first = decode(partial);
  assert.deepEqual(first, { frames: [], errors: [], leftover: partial });
  assert.deepEqual(decode(Uint8Array.of(...first.leftover, 0x00)), {
    frames: [],
    errors: [{ offset: 0, code: "escape" }],
    leftover: new Uint8Array(),
  });
});

test("[unhappy-6] rejects an intact reserved-type frame and recovers the next frame", () => {
  assert.deepEqual(decode(Uint8Array.of(
    0x44, 0x55, 0x7e, 0xff, 0x00, 0x01, 0x10, 0xf0, 0x7f,
    0x7e, 0x02, 0x00, 0x01, 0x30, 0xcd, 0x7f,
  )), {
    frames: [{ type: 0x02, payload: Uint8Array.of(0x30) }],
    errors: [{ offset: 2, code: "type" }],
    leftover: new Uint8Array(),
  });
});

test("[unhappy-6] rejects an empty reserved-type frame at the end of input", () => {
  assert.deepEqual(decode(Uint8Array.of(0x7e, 0xff, 0x00, 0x00, 0x01, 0x7f)), {
    frames: [],
    errors: [{ offset: 0, code: "type" }],
    leftover: new Uint8Array(),
  });
});

test("[unhappy-6] reports errors in stream order and preserves a final incomplete frame", () => {
  assert.deepEqual(decode(Uint8Array.of(
    0x7e, 0x01, 0x00, 0x00, 0x00, 0x7f,
    0x44,
    0x7e, 0xff, 0x00, 0x00, 0x01, 0x7f,
    0x7e, 0x02, 0x00, 0x01, 0x30, 0xcd, 0x7f,
    0x7e, 0x03,
  )), {
    frames: [{ type: 0x02, payload: Uint8Array.of(0x30) }],
    errors: [{ offset: 0, code: "check" }, { offset: 7, code: "type" }],
    leftover: Uint8Array.of(0x7e, 0x03),
  });
});
