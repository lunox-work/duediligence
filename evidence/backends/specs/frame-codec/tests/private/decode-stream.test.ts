import { test } from "node:test";
import assert from "node:assert/strict";
import { decode } from "../../src/index.js";

function wire(type: number, payload: Uint8Array): Uint8Array {
  const body = [type, payload.length >>> 8, payload.length & 255, ...payload];
  const check = (-body.reduce((sum, byte) => sum + byte, 0)) & 255;
  const out = [0x7e];
  for (const byte of [...body, check]) {
    if (byte >= 0x7d && byte <= 0x7f) out.push(0x7d, byte ^ 0x20);
    else out.push(byte);
  }
  out.push(0x7f);
  return Uint8Array.from(out);
}

function join(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// Extends "returns frames in order while ignoring surrounding noise".
test("[happy-2] returns dozens of distinct frames in order across varying noise and lengths", () => {
  const frames = Array.from({ length: 48 }, (_, i) => ({
    type: (i * 17 + 3) % 255,
    payload: Uint8Array.from({ length: i * 13 }, (_, j) => (i + j * 37) & 255),
  }));
  const parts: Uint8Array[] = [Uint8Array.of(0xff, 0x7d, 0x5e, 0x7f)];
  for (const frame of frames) {
    parts.push(wire(frame.type, frame.payload), Uint8Array.of(0, 0x7f, 0x7d, 0xff, 0x5e));
  }
  assert.deepEqual(decode(join(...parts)), { frames, errors: [], leftover: new Uint8Array() });
});

// Extends "decodes adjacent empty frames with the minimum and maximum valid types".
test("[happy-2] decodes adjacent empty frames for every valid type in descending order", () => {
  const frames = Array.from({ length: 255 }, (_, i) => ({ type: 254 - i, payload: new Uint8Array() }));
  assert.deepEqual(decode(join(...frames.map(frame => wire(frame.type, frame.payload)))), {
    frames, errors: [], leftover: new Uint8Array(),
  });
});

// Extends "an empty stream or noise alone produces no frames or errors".
test("[happy-2] ignores long noise containing every byte except start and ending in escape", () => {
  const alphabet = Array.from({ length: 256 }, (_, i) => i).filter(byte => byte !== 0x7e);
  const noise = Uint8Array.from({ length: 8192 }, (_, i) => alphabet[i % alphabet.length]);
  noise[noise.length - 1] = 0x7d;
  assert.deepEqual(decode(noise), { frames: [], errors: [], leftover: new Uint8Array() });
});

// Extends "retains and resumes every proper prefix of an ordinary frame".
test("[boundary-2] retains every split of a longer frame with a nonzero high length byte", () => {
  const payload = new Uint8Array(513).fill(0x2a);
  const frame = wire(0xb3, payload);
  for (let cut = 1; cut < frame.length; cut++) {
    const prefix = frame.slice(0, cut);
    const first = decode(join(Uint8Array.of(0xff, 0, 0x7d), prefix));
    assert.deepEqual(first, { frames: [], errors: [], leftover: prefix }, `cut ${cut}`);
    assert.deepEqual(decode(join(first.leftover, frame.slice(cut))), {
      frames: [{ type: 0xb3, payload }], errors: [], leftover: new Uint8Array(),
    });
  }
});

// Extends "resumes splits inside escapes in the type, length, payload and check".
test("[boundary-2] preserves raw prefixes when both length bytes and the check are escaped", () => {
  const payload = new Uint8Array(0x7e7f).fill(0x12);
  payload[0] = 0x7d;
  payload[payload.length - 2] = 0x7f;
  const sumWithoutLast = 0x7f + 0x7e + 0x7f + 0x7d + 0x7f + 0x12 * (payload.length - 3);
  payload[payload.length - 1] = (-sumWithoutLast - 0x7e) & 255;
  const frame = wire(0x7f, payload);
  const cuts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1000, frame.length - 5, frame.length - 3, frame.length - 2, frame.length - 1];
  for (const cut of cuts) {
    const prefix = frame.slice(0, cut);
    const first = decode(join(Uint8Array.of(0x5f, 0x7f), prefix));
    assert.deepEqual(first, { frames: [], errors: [], leftover: prefix });
    assert.deepEqual(decode(join(first.leftover, frame.slice(cut))), {
      frames: [{ type: 0x7f, payload }], errors: [], leftover: new Uint8Array(),
    });
  }
});

// Extends "returns completed frames while retaining only the next partial frame".
test("[boundary-2] returns several frames and retains a final start or escaped-header prefix", () => {
  const frames = [
    { type: 0x31, payload: Uint8Array.of(0x7f, 0x7e) },
    { type: 0x7d, payload: new Uint8Array() },
    { type: 0xfe, payload: Uint8Array.of(0, 0xff, 0x7d) },
  ];
  const nextPayload = new Uint8Array(0x7f).fill(0x7d);
  const next = wire(0x7e, nextPayload);
  for (const cut of [1, 2, 5, 6, next.length - 1]) {
    const partial = next.slice(0, cut);
    const first = decode(join(...frames.map(frame => wire(frame.type, frame.payload)), Uint8Array.of(0, 0x7d), partial));
    assert.deepEqual(first, { frames, errors: [], leftover: partial });
    assert.deepEqual(decode(join(first.leftover, next.slice(cut))), {
      frames: [{ type: 0x7e, payload: nextPayload }], errors: [], leftover: new Uint8Array(),
    });
  }
});

// Extends "a completed frame followed by noise leaves no partial frame".
test("[boundary-2] discards long trailing noise after several frames including an escaped check", () => {
  const frames = [
    { type: 0x7d, payload: Uint8Array.of(0x7e, 0x7f) },
    { type: 0x80, payload: new Uint8Array() },
    { type: 0x81, payload: new Uint8Array() },
  ];
  const noise = Uint8Array.from({ length: 4096 }, (_, i) => [0x7f, 0x7d, 0xff, 0x5e, 0x5d, 0x5f][i % 6]);
  assert.deepEqual(decode(join(...frames.map(frame => wire(frame.type, frame.payload)), noise)), {
    frames, errors: [], leftover: new Uint8Array(),
  });
});

// Extends "retains and resumes every proper prefix of an ordinary frame"
// with many successive resumptions rather than only two calls.
test("[boundary-2] receives a stream one byte at a time using only the returned leftover", () => {
  const frames = [
    { type: 0x7f, payload: Uint8Array.of(0x7d, 0x7e, 0x7f, 0x5f) },
    { type: 0x81, payload: new Uint8Array() },
    { type: 0x7d, payload: new Uint8Array(0x7e).fill(0x7f) },
  ];
  const stream = join(Uint8Array.of(0x7d), wire(frames[0].type, frames[0].payload),
    Uint8Array.of(0x7f, 0x5e), wire(frames[1].type, frames[1].payload), wire(frames[2].type, frames[2].payload));
  let leftover = new Uint8Array();
  const found: { type: number; payload: Uint8Array }[] = [];
  for (const byte of stream) {
    const result = decode(join(leftover, Uint8Array.of(byte)));
    assert.deepEqual(result.errors, []);
    found.push(...result.frames);
    leftover = new Uint8Array(result.leftover);
  }
  assert.deepEqual(found, frames);
  assert.deepEqual(leftover, new Uint8Array());
});

// Extends "decodes escaped end bytes in both the payload and the check".
test("[boundary-3] distinguishes many payload end bytes from every escaped check value", () => {
  const frames = [0x7d, 0x7e, 0x7f].map(check => {
    const type = 0x7d;
    const payload = new Uint8Array(129).fill(0x7f);
    payload[128] = (-type - 129 - 128 * 0x7f - check) & 255;
    return { type, payload };
  });
  assert.deepEqual(decode(join(...frames.map(frame => wire(frame.type, frame.payload)))), {
    frames, errors: [], leftover: new Uint8Array(),
  });
});

// Extends "an escaped escape followed by 0x5F counts as two payload bytes".
test("[boundary-3] never recursively unescapes literal suffixes after an escaped escape", () => {
  const payload = Uint8Array.from({ length: 600 }, (_, i) => [0x7d, 0x5f, 0x7d, 0x5e, 0x7d, 0x5d][i % 6]);
  assert.deepEqual(decode(wire(0x66, payload)), {
    frames: [{ type: 0x66, payload }], errors: [], leftover: new Uint8Array(),
  });
});

// Extends "escaped start, end and escape bytes all remain payload".
test("[boundary-3] returns all 256 payload byte values repeatedly without treating escaped starts as resyncs", () => {
  const payload = Uint8Array.from({ length: 2048 }, (_, i) => (i * 197 + 13) & 255);
  assert.deepEqual(decode(wire(0x7e, payload)), {
    frames: [{ type: 0x7e, payload }], errors: [], leftover: new Uint8Array(),
  });
});

// Extends "uses both big-endian length bytes for a 256-byte payload".
test("[boundary-3] uses nonsymmetric lengths with escaping in either or both length bytes", () => {
  for (const length of [255, 257, 511, 0x017d, 0x7d01, 0x7f7e]) {
    const payload = Uint8Array.from({ length }, (_, i) => (i * 11 + 0x7d) & 255);
    assert.deepEqual(decode(join(wire(0x39, payload), wire(0xa2, Uint8Array.of(0x7f)))), {
      frames: [{ type: 0x39, payload }, { type: 0xa2, payload: Uint8Array.of(0x7f) }],
      errors: [], leftover: new Uint8Array(),
    });
  }
});

// Extends "uses both big-endian length bytes for a 256-byte payload".
test("[boundary-3] accepts the full unsigned maximum length with over 130000 wire bytes", () => {
  const payload = Uint8Array.from({ length: 65535 }, (_, i) => [0x7f, 0x7e, 0x7d][i % 3]);
  assert.deepEqual(decode(wire(0xfe, payload)), {
    frames: [{ type: 0xfe, payload }], errors: [], leftover: new Uint8Array(),
  });
});

// Extends "retains and resumes every proper prefix of an ordinary frame".
test("[boundary-2] incomplete maximum-length frames retain wire bytes without reporting early errors", () => {
  const payload = new Uint8Array(65535).fill(0x7e);
  const frame = wire(0x7d, payload);
  for (const cut of [5, 4096, 65536, frame.length - 2, frame.length - 1]) {
    const prefix = frame.slice(0, cut);
    const first = decode(prefix);
    assert.deepEqual(first, { frames: [], errors: [], leftover: prefix });
    assert.deepEqual(decode(join(first.leftover, frame.slice(cut))), {
      frames: [{ type: 0x7d, payload }], errors: [], leftover: new Uint8Array(),
    });
  }
});

// Extends "returns frames in order while ignoring surrounding noise".
test("[happy-2] decodes only the bytes of a nonzero-offset input view", () => {
  const wanted = { type: 0x19, payload: Uint8Array.of(0x7d, 0x5f, 0x7f) };
  const outside = wire(0x44, Uint8Array.of(0x22));
  const inside = wire(wanted.type, wanted.payload);
  const backing = join(outside, inside, outside);
  assert.deepEqual(decode(backing.subarray(outside.length, outside.length + inside.length)), {
    frames: [wanted], errors: [], leftover: new Uint8Array(),
  });
});
