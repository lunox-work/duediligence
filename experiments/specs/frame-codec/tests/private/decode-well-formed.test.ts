import { test } from "node:test";
import assert from "node:assert/strict";
import { decode } from "../../src/index.js";

interface Plain {
  frames: { type: number; payload: number[] }[];
  errors: { offset: number; code: string }[];
  leftover: number[];
}

function plain(result: ReturnType<typeof decode>): Plain {
  return {
    frames: result.frames.map((f) => ({ type: f.type, payload: Array.from(f.payload) })),
    errors: result.errors.map((e) => ({ offset: e.offset, code: e.code })),
    leftover: Array.from(result.leftover),
  };
}

function decoded(values: number[]): Plain {
  return plain(decode(Uint8Array.from(values)));
}

function escaped(values: number[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (v === 0x7e || v === 0x7f || v === 0x7d) out.push(0x7d, v ^ 0x20);
    else out.push(v);
  }
  return out;
}

function checkOf(type: number, payload: number[]): number {
  const len = payload.length;
  let sum = type + (len >> 8) + (len & 0xff);
  for (const p of payload) sum += p;
  return (256 - (sum % 256)) % 256;
}

// A well-formed frame as the spec defines it, built independently of the code under test.
function frame(type: number, payload: number[]): number[] {
  const len = payload.length;
  return [0x7e, ...escaped([type, len >> 8, len & 0xff, ...payload, checkOf(type, payload)]), 0x7f];
}

// Type 0x02, payload 41 42: 0x02 + 0x02 + 0x41 + 0x42 = 135, 135 + 0x79 = 256.
const FRAME_A = [0x7e, 0x02, 0x00, 0x02, 0x41, 0x42, 0x79, 0x7f];
const DECODED_A = { type: 0x02, payload: [0x41, 0x42] };

// Type 0x03, payload 7E: 0x03 + 0x01 + 0x7E = 130, 130 + 0x7E = 256; payload and check escaped.
const FRAME_B = [0x7e, 0x03, 0x00, 0x01, 0x7d, 0x5e, 0x7d, 0x5e, 0x7f];
const DECODED_B = { type: 0x03, payload: [0x7e] };

// Extends "[happy-2] two frames among other bytes are returned in order with no errors and nothing left over".
test("[happy-2] five frames with escaped types and payloads among other bytes are returned in order", () => {
  const specs: [number, number[]][] = [
    [0x00, []],
    [0x7d, [0x7d]],
    [0x7e, [0x7e, 0x7f, 0x7d]],
    [0x7f, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]],
    [0xfe, [0xff, 0xff, 0xff]],
  ];
  const gaps = [[0x00, 0x5e, 0x5d], [0x7f], [0x7d, 0x5e], [0x20, 0x7f, 0x7f], []];
  const stream: number[] = [];
  specs.forEach(([type, payload], i) => stream.push(...gaps[i]!, ...frame(type, payload)));
  stream.push(0x41);
  assert.deepEqual(decoded(stream), {
    frames: specs.map(([type, payload]) => ({ type, payload })),
    errors: [],
    leftover: [],
  });
});

// Extends "[happy-2] frames back to back, and stray 0x7F and 0x7D bytes between frames, are not errors".
test("[happy-2] a stray 0x7D right before a start byte does not escape it", () => {
  const stream = [0x7d, ...FRAME_A, 0x7d, ...FRAME_B, 0x7d, 0x7d, ...FRAME_A, 0x7d];
  assert.deepEqual(decoded(stream), { frames: [DECODED_A, DECODED_B, DECODED_A], errors: [], leftover: [] });
});

// Extends "[happy-2] two frames among other bytes are returned in order with no errors and nothing left over".
test("[happy-2] payloads longer than 255 bytes use the high length byte", () => {
  const p300 = Array.from({ length: 300 }, (_, i) => i & 0xff);
  const p65535 = Array.from({ length: 65535 }, (_, i) => (i * 7) & 0xff);
  const stream = [0x00, ...frame(0x05, p300), 0x41, ...frame(0x06, p65535), ...FRAME_A];
  assert.deepEqual(decoded(stream), {
    frames: [{ type: 0x05, payload: p300 }, { type: 0x06, payload: p65535 }, DECODED_A],
    errors: [],
    leftover: [],
  });
});

// Extends "[happy-2] frames back to back, and stray 0x7F and 0x7D bytes between frames, are not errors".
test("[happy-2] every type from 0x00 to 0xFE is returned, frames back to back", () => {
  const stream: number[] = [];
  const expected: { type: number; payload: number[] }[] = [];
  for (let type = 0; type <= 0xfe; type++) {
    stream.push(...frame(type, [type]));
    expected.push({ type, payload: [type] });
  }
  assert.deepEqual(decoded(stream), { frames: expected, errors: [], leftover: [] });
});

// Extends "[happy-2] two frames among other bytes are returned in order with no errors and nothing left over".
test("[happy-2] a payload of every byte value is returned unescaped", () => {
  const payload = Array.from({ length: 256 }, (_, i) => i);
  assert.deepEqual(decoded([0x5d, ...frame(0x7e, payload), 0x5e]), {
    frames: [{ type: 0x7e, payload }],
    errors: [],
    leftover: [],
  });
});

// Extends "[happy-2] two frames among other bytes are returned in order with no errors and nothing left over".
test("[happy-2] decoding a view into a larger buffer sees only the view's bytes", () => {
  const whole = Uint8Array.from([...FRAME_A, 0x41, ...FRAME_B, ...FRAME_A]);
  const view = whole.subarray(FRAME_A.length, FRAME_A.length + 1 + FRAME_B.length);
  const result = decode(view);
  assert.ok(result.frames[0]?.payload instanceof Uint8Array);
  assert.ok(result.leftover instanceof Uint8Array);
  assert.deepEqual(plain(result), { frames: [DECODED_B], errors: [], leftover: [] });
});

// Extends "[happy-2] two frames among other bytes are returned in order with no errors and nothing left over".
test("[happy-2] empty payloads of several types are returned among other bytes", () => {
  const stream = [0x7f, ...frame(0x01, []), ...frame(0x7e, []), 0x00, ...frame(0x00, [])];
  assert.deepEqual(decoded(stream), {
    frames: [
      { type: 0x01, payload: [] },
      { type: 0x7e, payload: [] },
      { type: 0x00, payload: [] },
    ],
    errors: [],
    leftover: [],
  });
});

// A frame of type 0x7E with 125 payload bytes (length 00 7D escaped) whose check byte is 0x7F (escaped).
function longEscapedFrame(): { bytes: number[]; decoded: { type: number; payload: number[] } } {
  const payload = Array.from({ length: 124 }, (_, i) => [0x7d, 0x7e, 0x7f, 0x41][i % 4]!);
  let sum = 0x7e + 0x00 + 0x7d;
  for (const p of payload) sum += p;
  payload.push((((-(sum + 0x7f)) % 256) + 256) % 256);
  const bytes = frame(0x7e, payload);
  assert.deepEqual(bytes.slice(0, 5), [0x7e, 0x7d, 0x5e, 0x00, 0x7d]);
  assert.deepEqual(bytes.slice(bytes.length - 3), [0x7d, 0x5f, 0x7f]);
  return { bytes, decoded: { type: 0x7e, payload } };
}

// Extends "[boundary-2] a frame cut at every point after its start byte, including inside an escape, is completed by the next call".
test("[boundary-2] a long frame with escaped type, length, payload and check, cut at every point, is completed by the next call", () => {
  const { bytes: f, decoded: expected } = longEscapedFrame();
  const before = [0x7d, 0x7f, 0x41, ...FRAME_A, 0x7d];
  for (let cut = 1; cut < f.length; cut++) {
    const part1 = decoded([...before, ...f.slice(0, cut)]);
    assert.deepEqual(part1, { frames: [DECODED_A], errors: [], leftover: f.slice(0, cut) }, `first part, cut at ${cut}`);
    const part2 = decoded([...part1.leftover, ...f.slice(cut)]);
    assert.deepEqual(part2, { frames: [expected], errors: [], leftover: [] }, `second part, cut at ${cut}`);
  }
});

// Extends "[boundary-2] a frame cut mid-way leaves the first part over from its start byte, and completes with the second part".
test("[boundary-2] a frame cut into three parts stays left over until its last part arrives", () => {
  const payload = Array.from({ length: 4096 }, (_, i) => (i * 31) & 0xff);
  const f = frame(0x10, payload);
  for (const [c1, c2] of [[1, 2000], [4, 5], [100, f.length - 1], [2, 3]] as const) {
    const part1 = decoded(f.slice(0, c1));
    assert.deepEqual(part1, { frames: [], errors: [], leftover: f.slice(0, c1) }, `first part, cuts ${c1} ${c2}`);
    const part2 = decoded([...part1.leftover, ...f.slice(c1, c2)]);
    assert.deepEqual(part2, { frames: [], errors: [], leftover: f.slice(0, c2) }, `second part, cuts ${c1} ${c2}`);
    const part3 = decoded([...part2.leftover, ...f.slice(c2)]);
    assert.deepEqual(
      part3,
      { frames: [{ type: 0x10, payload }], errors: [], leftover: [] },
      `third part, cuts ${c1} ${c2}`,
    );
  }
});

// Extends "[boundary-2] a frame cut mid-way leaves the first part over from its start byte, and completes with the second part".
test("[boundary-2] the call completing a split frame also returns the frames after it and leaves the next partial frame over", () => {
  const part1 = decoded([0x00, ...FRAME_A, ...FRAME_B.slice(0, 6)]);
  assert.deepEqual(part1, { frames: [DECODED_A], errors: [], leftover: FRAME_B.slice(0, 6) });
  const part2 = decoded([...part1.leftover, ...FRAME_B.slice(6), 0x41, ...FRAME_A, ...FRAME_B, ...FRAME_A.slice(0, 3)]);
  assert.deepEqual(part2, {
    frames: [DECODED_B, DECODED_A, DECODED_B],
    errors: [],
    leftover: FRAME_A.slice(0, 3),
  });
});

// Extends "[boundary-2] a stream ending with no start byte in progress leaves nothing over".
test("[boundary-2] streams ending in stray 0x7D or 0x7F bytes, or right after an end byte, leave nothing over", () => {
  assert.deepEqual(decoded([...FRAME_B, 0x7d]), { frames: [DECODED_B], errors: [], leftover: [] });
  assert.deepEqual(decoded([...FRAME_A, ...FRAME_B]), { frames: [DECODED_A, DECODED_B], errors: [], leftover: [] });
  assert.deepEqual(decoded([0x7d]), { frames: [], errors: [], leftover: [] });
  assert.deepEqual(decoded([0x7f, 0x7d, 0x7f, 0x5e]), { frames: [], errors: [], leftover: [] });
});

// Extends "[boundary-2] a frame cut at every point after its start byte, including inside an escape, is completed by the next call".
test("[boundary-2] a lone start byte at the end of a long stream is left over", () => {
  const stream = [...FRAME_A, ...FRAME_B, ...FRAME_A, 0x41, 0x7e];
  assert.deepEqual(decoded(stream), { frames: [DECODED_A, DECODED_B, DECODED_A], errors: [], leftover: [0x7e] });
});

// Extends "[boundary-3] an escaped 0x7F in the payload counts as one byte of the length".
test("[boundary-3] 127 escaped 0x7F payload bytes, with escaped type and length, end at the end byte", () => {
  const payload = new Array<number>(0x7f).fill(0x7f);
  const f = frame(0x7f, payload);
  assert.equal(f.length, 1 + 2 + 1 + 2 + 2 * 0x7f + 1 + 1);
  assert.deepEqual(decoded([...f, ...FRAME_A]), {
    frames: [{ type: 0x7f, payload }, DECODED_A],
    errors: [],
    leftover: [],
  });
});

// Extends "[boundary-3] a payload and check byte made only of escapes end at the end byte, and the next frame follows".
test("[boundary-3] a payload of all three escapes counts each as one byte", () => {
  const payload = [0x7d, 0x7e, 0x7f, 0x7d, 0x7e, 0x7f];
  assert.deepEqual(decoded([...frame(0x01, payload), ...FRAME_B]), {
    frames: [{ type: 0x01, payload }, DECODED_B],
    errors: [],
    leftover: [],
  });
});

// Extends "[boundary-3] an escaped 0x7F in the payload counts as one byte of the length".
test("[boundary-3] 1000 escaped 0x7F payload bytes are 1000 bytes of the length, not 2000", () => {
  const payload = new Array<number>(1000).fill(0x7f);
  assert.deepEqual(decoded([0x41, ...frame(0x02, payload), 0x42, ...FRAME_A]), {
    frames: [{ type: 0x02, payload }, DECODED_A],
    errors: [],
    leftover: [],
  });
});
