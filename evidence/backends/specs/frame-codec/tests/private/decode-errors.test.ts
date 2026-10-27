import { test } from "node:test";
import assert from "node:assert/strict";
import { decode } from "../../src/index.js";

function wire(type: number, payload: Uint8Array, forcedCheck?: number): Uint8Array {
  const body = [type, payload.length >>> 8, payload.length & 255, ...payload];
  const check = forcedCheck ?? ((-body.reduce((sum, byte) => sum + byte, 0)) & 255);
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

// Extends "reports a wrong check at the start offset and recovers the next frame".
test("[unhappy-2] reports an escaped wrong check after an intact frame and keeps later frames", () => {
  const before = { type: 0x7e, payload: Uint8Array.of(0x7f, 0x7d) };
  const after = { type: 0xa5, payload: Uint8Array.of(0x7e, 0xff, 0) };
  const lead = join(Uint8Array.of(0x7f, 0x7d, 0), wire(before.type, before.payload), Uint8Array.of(0x55));
  // Correct check is 0x81; the supplied 0x7E must itself be escaped.
  const bad = wire(0x7d, Uint8Array.of(0x7e, 0x7f, 2), 0x7e);
  assert.deepEqual(decode(join(lead, bad, Uint8Array.of(0x7f, 0x7d), wire(after.type, after.payload))), {
    frames: [before, after], errors: [{ offset: lead.length, code: "check" }], leftover: new Uint8Array(),
  });
});

// Extends "rejects a wrong check in an empty frame ending exactly at input end".
test("[unhappy-2] rejects wrong empty-frame checks for nondefault types including escaped types", () => {
  for (const type of [0, 0x42, 0x7d, 0x7e, 0x7f, 0xfe]) {
    const badCheck = ((-type) + 1) & 255;
    assert.deepEqual(decode(join(Uint8Array.of(0x11, 0x22, 0x7f), wire(type, new Uint8Array(), badCheck))), {
      frames: [], errors: [{ offset: 3, code: "check" }], leftover: new Uint8Array(),
    });
  }
});

// Extends "reports a wrong check at the start offset and recovers the next frame".
test("[unhappy-2] accumulates multiple check failures using raw offsets across escaped large frames", () => {
  const parts: Uint8Array[] = [Uint8Array.of(0x33, 0x7f)];
  const errors: { offset: number; code: "check" }[] = [];
  let offset = 2;
  for (const length of [0, 257, 0x7d7f]) {
    const type = 0x7e;
    const payload = new Uint8Array(length).fill(0x7f);
    const sum = type + (length >>> 8) + (length & 255) + length * 0x7f;
    const bad = wire(type, payload, (-sum + 1) & 255);
    errors.push({ offset, code: "check" });
    parts.push(bad, Uint8Array.of(0x7d, 0x7f));
    offset += bad.length + 2;
  }
  const partial = Uint8Array.of(0x7e, 0x7d);
  parts.push(partial);
  assert.deepEqual(decode(join(...parts)), { frames: [], errors, leftover: partial });
});

// Extends "an unescaped start interrupts a payload and begins an intact frame".
test("[unhappy-3] resynchronizes on a start at every unescaped field boundary", () => {
  const old = wire(0x7d, Uint8Array.of(0x7f, 0x7e, 0x31));
  const next = { type: 0x7f, payload: Uint8Array.of(0x7e, 0x5f, 0x7d) };
  for (let cut = 1; cut < old.length; cut++) {
    // An escape followed by a raw start has two competing error conditions;
    // exercise starts between complete escaped bytes instead.
    if (old[cut - 1] === 0x7d) continue;
    assert.deepEqual(decode(join(Uint8Array.of(0x99, 0x7f, 0), old.slice(0, cut), wire(next.type, next.payload))), {
      frames: [next], errors: [{ offset: 3, code: "truncated" }], leftover: new Uint8Array(),
    });
  }
});

// Extends "adjacent starts truncate the first frame and preserve the second".
test("[unhappy-3] reports every interruption in a run of adjacent starts", () => {
  const starts = new Uint8Array(32).fill(0x7e);
  const next = { type: 0x82, payload: new Uint8Array() };
  assert.deepEqual(decode(join(Uint8Array.of(0x7f, 0x7d), starts, wire(next.type, next.payload))), {
    frames: [next],
    errors: Array.from({ length: 32 }, (_, i) => ({ offset: i + 2, code: "truncated" })),
    leftover: new Uint8Array(),
  });
});

// Extends "a new start in place of the end is a truncation".
test("[unhappy-3] treats a start after each escaped check as truncation rather than an escaped end", () => {
  const next = { type: 0x2f, payload: Uint8Array.of(0) };
  for (const type of [0x81, 0x82, 0x83]) {
    const noEnd = wire(type, new Uint8Array()).slice(0, -1);
    assert.deepEqual(decode(join(Uint8Array.of(0x55), noEnd, wire(next.type, next.payload))), {
      frames: [next], errors: [{ offset: 1, code: "truncated" }], leftover: new Uint8Array(),
    });
  }
});

// Extends "a final interrupting start is retained as a new incomplete frame".
test("[unhappy-3] retains only the newest partial frame after several interrupted headers", () => {
  const partial = Uint8Array.of(0x7e, 0x7d);
  const first = decode(join(Uint8Array.of(0x7d, 0x7e, 0x42, 0, 2, 0x33, 0x7e, 0x50), partial));
  assert.deepEqual(first, {
    frames: [], errors: [{ offset: 1, code: "truncated" }, { offset: 6, code: "truncated" }], leftover: partial,
  });
  const full = wire(0x7e, Uint8Array.of(0x7f));
  assert.deepEqual(decode(join(first.leftover, full.slice(partial.length))), {
    frames: [{ type: 0x7e, payload: Uint8Array.of(0x7f) }], errors: [], leftover: new Uint8Array(),
  });
});

// Extends "reports a missing end and recovers an intact following frame".
test("[unhappy-4] recovers after missing ends in escape-heavy frames without consuming later starts", () => {
  const good = { type: 0xa1, payload: Uint8Array.of(0x7f, 0x7d, 0x5f) };
  const damaged = wire(0x7e, new Uint8Array(0x17d).fill(0x7f));
  damaged[damaged.length - 1] = 0x23;
  const noise = Uint8Array.of(0x7f, 0x7d, 0x01, 0x55);
  assert.deepEqual(decode(join(noise, damaged, noise, wire(good.type, good.payload))), {
    frames: [good], errors: [{ offset: noise.length, code: "framing" }], leftover: new Uint8Array(),
  });
});

// Extends "a wrong final byte is framing but an absent end is incomplete".
test("[unhappy-4] distinguishes missing and wrong ends after an escaped check during resumption", () => {
  const frame = wire(0x81, new Uint8Array());
  const prefix = frame.slice(0, -1);
  const first = decode(join(Uint8Array.of(0x44, 0xff), prefix));
  assert.deepEqual(first, { frames: [], errors: [], leftover: prefix });
  assert.deepEqual(decode(join(first.leftover, Uint8Array.of(0x7f))), {
    frames: [{ type: 0x81, payload: new Uint8Array() }], errors: [], leftover: new Uint8Array(),
  });
  for (const wrongEnd of [0, 0x42, 0xff]) {
    assert.deepEqual(decode(join(first.leftover, Uint8Array.of(wrongEnd))), {
      frames: [], errors: [{ offset: 0, code: "framing" }], leftover: new Uint8Array(),
    });
  }
});

// Extends "reports a missing end and recovers an intact following frame".
// Once the check is complete, the required end is a raw 0x7F. An escape
// marker in that position is itself the specified wrong final byte.
test("[unhappy-4] an escape marker cannot substitute for the required raw end byte", () => {
  const noEnd = wire(0x29, Uint8Array.of(0x7f)).slice(0, -1);
  assert.deepEqual(decode(join(noEnd, Uint8Array.of(0x7d))), {
    frames: [], errors: [{ offset: 0, code: "framing" }], leftover: new Uint8Array(),
  });
  const good = { type: 0x65, payload: Uint8Array.of(0x7e) };
  assert.deepEqual(decode(join(noEnd, Uint8Array.of(0x7d, 0x5f), wire(good.type, good.payload))), {
    frames: [good], errors: [{ offset: 0, code: "framing" }], leftover: new Uint8Array(),
  });
});

// Extends "reports a bad payload escape and recovers the next frame".
test("[unhappy-5] reports a later bad escape after valid payload escapes with offsets in raw bytes", () => {
  const before = { type: 0x7d, payload: Uint8Array.of(0x7e, 0x7f) };
  const good = { type: 0xfe, payload: Uint8Array.of(0xff) };
  const lead = join(wire(before.type, before.payload), Uint8Array.of(0x7d, 0x5d, 0x7f));
  const bad = Uint8Array.of(0x7e, 0x7d, 0x5e, 0, 5, 0x7d, 0x5f, 0x7d, 0x5d, 0x7d, 0x61, 0, 0x7f);
  assert.deepEqual(decode(join(lead, bad, wire(good.type, good.payload))), {
    frames: [before, good], errors: [{ offset: lead.length, code: "escape" }], leftover: new Uint8Array(),
  });
});

// Extends "rejects noncanonical escape suffixes even when the suffix is last".
test("[unhappy-5] rejects every unambiguous noncanonical suffix instead of masking arbitrary bytes", () => {
  for (let suffix = 0; suffix <= 255; suffix++) {
    // Raw delimiters introduce competing start/end conditions; precedence
    // between those conditions and an invalid escape is not specified.
    if ([0x5d, 0x5e, 0x5f, 0x7e, 0x7f].includes(suffix)) continue;
    assert.deepEqual(decode(Uint8Array.of(0x55, 0x7e, 0x32, 0, 1, 0x7d, suffix)), {
      frames: [], errors: [{ offset: 1, code: "escape" }], leftover: new Uint8Array(),
    }, `suffix ${suffix}`);
  }
});

// Extends "finds an intact frame before the damaged frame's apparent end".
test("[unhappy-5] rescans nested damaged frames before a long declared payload would end", () => {
  const good = { type: 0x7e, payload: Uint8Array.of(0x7d, 0x7f, 0x5d) };
  const badOuter = Uint8Array.of(0x7e, 0x21, 2, 0, 0x7d, 0x40);
  const badInner = Uint8Array.of(0x7e, 0x22, 1, 0, 0x7d, 0x41);
  assert.deepEqual(decode(join(Uint8Array.of(0x55), badOuter, badInner, wire(good.type, good.payload), Uint8Array.of(0, 0x7f))), {
    frames: [good], errors: [{ offset: 1, code: "escape" }, { offset: 7, code: "escape" }], leftover: new Uint8Array(),
  });
});

// Extends "validates escapes in the type, either length byte, and the check".
test("[unhappy-5] validates nonzero bad suffixes in every field after earlier escaped fields", () => {
  const prefixes = [
    Uint8Array.of(0x7e),
    Uint8Array.of(0x7e, 0x7d, 0x5f),
    Uint8Array.of(0x7e, 0x7d, 0x5e, 0x7d, 0x5d),
    Uint8Array.of(0x7e, 0x7d, 0x5d, 0, 1),
    Uint8Array.of(0x7e, 0x7d, 0x5f, 0, 1, 0x7d, 0x5e),
  ];
  const good = { type: 0x31, payload: Uint8Array.of(0x7f) };
  for (const prefix of prefixes) {
    for (const suffix of [0x20, 0x5b, 0x5c, 0x60, 0x80, 0xff]) {
      assert.deepEqual(decode(join(Uint8Array.of(0xff, 0x7d), prefix, Uint8Array.of(0x7d, suffix), wire(good.type, good.payload))), {
        frames: [good], errors: [{ offset: 2, code: "escape" }], leftover: new Uint8Array(),
      });
    }
  }
});

// Extends "a trailing escape is incomplete until an invalid suffix arrives".
test("[unhappy-5] defers trailing escapes in headers and checks then reports the resumed offset", () => {
  const prefixes = [
    Uint8Array.of(0x7e, 0x7d),
    Uint8Array.of(0x7e, 0x42, 0x7d),
    Uint8Array.of(0x7e, 0x42, 0, 0x7d),
    Uint8Array.of(0x7e, 0x42, 0, 0, 0x7d),
  ];
  for (const partial of prefixes) {
    const first = decode(join(Uint8Array.of(0x7f, 0x7d), partial));
    assert.deepEqual(first, { frames: [], errors: [], leftover: partial });
    assert.deepEqual(decode(join(Uint8Array.of(0x33, 0x44, 0x55), first.leftover, Uint8Array.of(0x5c))), {
      frames: [], errors: [{ offset: 3, code: "escape" }], leftover: new Uint8Array(),
    });
  }
});

// Extends "rejects an intact reserved-type frame and recovers the next frame".
test("[unhappy-6] skips a reserved type with escaped lengths and payloads and preserves surrounding frames", () => {
  const before = { type: 0, payload: Uint8Array.of(0x7f) };
  const after = { type: 0xfe, payload: Uint8Array.of(0x7d) };
  const lead = join(Uint8Array.of(0x55), wire(before.type, before.payload), Uint8Array.of(0x7f, 0x7d));
  const payload = Uint8Array.from({ length: 0x7d7e }, (_, i) => [0x7e, 0x7f, 0x7d][i % 3]);
  assert.deepEqual(decode(join(lead, wire(0xff, payload), wire(after.type, after.payload))), {
    frames: [before, after], errors: [{ offset: lead.length, code: "type" }], leftover: new Uint8Array(),
  });
});

// Extends "rejects an empty reserved-type frame at the end of input".
test("[unhappy-6] reports each adjacent empty reserved-type frame including the last one", () => {
  const bad = wire(0xff, new Uint8Array());
  const good = { type: 0x7f, payload: new Uint8Array() };
  const prefix = join(wire(good.type, good.payload), Uint8Array.of(0x7f));
  const count = 9;
  assert.deepEqual(decode(join(prefix, ...Array.from({ length: count }, () => bad))), {
    frames: [good],
    errors: Array.from({ length: count }, (_, i) => ({ offset: prefix.length + i * bad.length, code: "type" })),
    leftover: new Uint8Array(),
  });
});

// Extends "reports errors in stream order and preserves a final incomplete frame".
test("[unhappy-6] preserves ordered errors of all five kinds with intact frames and a final partial escape", () => {
  const good1 = { type: 0x7e, payload: Uint8Array.of(0x7f, 0x7d) };
  const good2 = { type: 0x82, payload: new Uint8Array() };
  const check = wire(0x61, Uint8Array.of(0x10), 0);
  const framing = wire(0x41, Uint8Array.of(0x7f));
  framing[framing.length - 1] = 0x22;
  const escape = Uint8Array.of(0x7e, 0x32, 0, 2, 0x7d, 0x80);
  const interrupted = Uint8Array.of(0x7e, 0x11, 0, 4, 0x22);
  const reserved = wire(0xff, Uint8Array.of(0x7d, 0x7e, 0x7f));
  const partial = Uint8Array.of(0x7e, 0x7d, 0x5f, 0, 1, 0x7d);
  const pieces = [Uint8Array.of(0x7f, 0x7d), wire(good1.type, good1.payload),
    reserved, framing, escape, interrupted, wire(good2.type, good2.payload), check, partial];
  const offsets: number[] = [];
  let length = 0;
  for (const piece of pieces) { offsets.push(length); length += piece.length; }
  assert.deepEqual(decode(join(...pieces)), {
    frames: [good1, good2],
    errors: [
      { offset: offsets[2], code: "type" },
      { offset: offsets[3], code: "framing" },
      { offset: offsets[4], code: "escape" },
      { offset: offsets[5], code: "truncated" },
      { offset: offsets[7], code: "check" },
    ],
    leftover: partial,
  });
});

// Extends "reports a wrong check at the start offset and recovers the next frame".
test("[unhappy-2] error offsets are relative to an input view rather than its backing buffer", () => {
  const outside = wire(0xff, new Uint8Array());
  const bad = wire(0x46, Uint8Array.of(0x7e), 0);
  const good = { type: 0x29, payload: Uint8Array.of(0x7d, 0x5e) };
  const input = join(Uint8Array.of(0x7f, 0x55, 0x7d), bad, wire(good.type, good.payload));
  const backing = join(outside, input, Uint8Array.of(0x7e));
  assert.deepEqual(decode(backing.subarray(outside.length, outside.length + input.length)), {
    frames: [good], errors: [{ offset: 3, code: "check" }], leftover: new Uint8Array(),
  });
});
