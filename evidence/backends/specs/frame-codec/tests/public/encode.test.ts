import { test } from "node:test";
import assert from "node:assert/strict";
import { encode } from "../../src/index.js";

test("[happy-1] encodes the specified type and payload with their check byte", () => {
  assert.deepEqual(
    encode(0x01, Uint8Array.of(0x10, 0x20)),
    Uint8Array.of(0x7e, 0x01, 0x00, 0x02, 0x10, 0x20, 0xcd, 0x7f),
  );
});

test("[happy-1] encodes an empty payload", () => {
  assert.deepEqual(
    encode(0x01, new Uint8Array()),
    Uint8Array.of(0x7e, 0x01, 0x00, 0x00, 0xff, 0x7f),
  );
});

test("[happy-1] accepts both endpoints of the valid type range", () => {
  assert.deepEqual(
    encode(0x00, new Uint8Array()),
    Uint8Array.of(0x7e, 0x00, 0x00, 0x00, 0x00, 0x7f),
  );
  assert.deepEqual(
    encode(0xfe, new Uint8Array()),
    Uint8Array.of(0x7e, 0xfe, 0x00, 0x00, 0x02, 0x7f),
  );
});

test("[boundary-1] escapes the specified type and payload using an unescaped checksum", () => {
  assert.deepEqual(
    encode(0x7e, Uint8Array.of(0x7d, 0x7f, 0x00)),
    Uint8Array.of(0x7e, 0x7d, 0x5e, 0x00, 0x03, 0x7d, 0x5d, 0x7d, 0x5f, 0x00, 0x83, 0x7f),
  );
});

test("[boundary-1] escapes each reserved byte when used as the type", () => {
  for (const type of [0x7d, 0x7e, 0x7f]) {
    assert.deepEqual(
      encode(type, new Uint8Array()),
      Uint8Array.of(0x7e, 0x7d, type ^ 0x20, 0x00, 0x00, 0x100 - type, 0x7f),
    );
  }
});

test("[boundary-1] escapes all three reserved payload values", () => {
  assert.deepEqual(
    encode(0x01, Uint8Array.of(0x7d, 0x7e, 0x7f)),
    Uint8Array.of(0x7e, 0x01, 0x00, 0x03, 0x7d, 0x5d, 0x7d, 0x5e, 0x7d, 0x5f, 0x82, 0x7f),
  );
});

test("[boundary-1] escapes each reserved check byte", () => {
  const cases = [
    { payload: 0x82, escapedCheck: 0x5d },
    { payload: 0x81, escapedCheck: 0x5e },
    { payload: 0x80, escapedCheck: 0x5f },
  ];
  for (const { payload, escapedCheck } of cases) {
    assert.deepEqual(
      encode(0x00, Uint8Array.of(payload)),
      Uint8Array.of(0x7e, 0x00, 0x00, 0x01, payload, 0x7d, escapedCheck, 0x7f),
    );
  }
});

test("[boundary-1] escapes either length byte without changing the payload length", () => {
  for (const reserved of [0x7d, 0x7e, 0x7f]) {
    for (const highByte of [false, true]) {
      const length = highByte ? reserved * 256 : reserved;
      const expected = new Uint8Array(length + 7);
      expected.set(highByte
        ? [0x7e, 0x01, 0x7d, reserved ^ 0x20, 0x00]
        : [0x7e, 0x01, 0x00, 0x7d, reserved ^ 0x20]);
      expected.set([0xff - reserved, 0x7f], expected.length - 2);
      assert.deepEqual(encode(0x01, new Uint8Array(length)), expected);
    }
  }
});

test("[unhappy-1] rejects the reserved type and types just outside the byte range", () => {
  for (const type of [0xff, -1, 0x100]) {
    assert.throws(() => encode(type, new Uint8Array()));
  }
});

test("[unhappy-1] rejects a payload one byte longer than the maximum", () => {
  assert.throws(() => encode(0x01, new Uint8Array(65536)));
});

test("[unhappy-1] accepts the maximum payload length of 65535 bytes", () => {
  const expected = new Uint8Array(65541);
  expected.set([0x7e, 0x01, 0xff, 0xff]);
  expected.set([0x01, 0x7f], expected.length - 2);
  assert.deepEqual(encode(0x01, new Uint8Array(65535)), expected);
});
