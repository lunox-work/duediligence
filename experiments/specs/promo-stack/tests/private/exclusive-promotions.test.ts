import { test } from "node:test";
import assert from "node:assert/strict";
import { priceCart } from "../../src/index.js";
import type { CartLine, Promotion } from "../../src/index.js";

function line(productId: string, unitPrice: number, quantity: number, tags: string[] = []): CartLine {
  return { productId, unitPrice, quantity, tags };
}

function percent(id: string, value: number, priority: number, exclusive: boolean, tag?: string): Promotion {
  return { id, priority, exclusive, kind: "percent", percent: value, ...(tag === undefined ? {} : { tag }) };
}

function fixed(id: string, amount: number, priority: number, exclusive: boolean, tag?: string): Promotion {
  return { id, priority, exclusive, kind: "fixed", amount, ...(tag === undefined ? {} : { tag }) };
}

function bundle(id: string, buy: number, free: number, priority: number, exclusive: boolean, tag?: string): Promotion {
  return { id, priority, exclusive, kind: "bundle", buy, free, ...(tag === undefined ? {} : { tag }) };
}

// Extends public "[boundary-5] an exclusive promotion blocks the promotions after it but not those before": more on each side, every kind.
test("[boundary-5] an exclusive promotion after two others blocks a percent, a fixed and a bundle after it", () => {
  const cart = priceCart(
    [line("sku-4", 1000, 4)],
    [
      bundle("after-bundle", 1, 1, 6, false),
      percent("after-percent", 20, 5, false),
      fixed("excl", 100, 3, true),
      fixed("before-fixed", 50, 2, false),
      percent("before-percent", 10, 1, false),
      fixed("after-fixed", 10, 4, false),
    ],
  );

  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "before-percent", amount: 400 },
    { promotionId: "before-fixed", amount: 200 },
    { promotionId: "excl", amount: 400 },
  ]);
  assert.equal(cart.lines[0].total, 3000);
  assert.equal(cart.total, 3000);
});

// Extends public "[boundary-5] ...blocks the promotions after it": an exclusive promotion only ends the lines it matches.
test("[boundary-5] an exclusive promotion for a tag does not block promotions on lines without that tag", () => {
  const cart = priceCart(
    [line("x-line", 1000, 1, ["x"]), line("y-line", 2000, 1, ["y"])],
    [percent("plain", 10, 2, false), fixed("excl-x", 100, 1, true, "x")],
  );

  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "excl-x", amount: 100 }]);
  assert.equal(cart.lines[0].total, 900);
  assert.deepEqual(cart.lines[1].promotions, [{ promotionId: "plain", amount: 200 }]);
  assert.equal(cart.lines[1].total, 1800);
  assert.equal(cart.total, 2700);
});

// Extends public "[boundary-5] when the exclusive promotion comes first in order, only it applies": first by id among equal priorities.
test("[boundary-5] an exclusive promotion first by id among equal priorities is the only one applied", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [percent("b-plain", 50, 1, false), fixed("a-excl", 100, 1, true), percent("c-plain", 10, 1, false)],
  );

  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "a-excl", amount: 100 }]);
  assert.equal(cart.lines[0].total, 900);
  assert.equal(cart.total, 900);
});

// Extends public "[boundary-5] an exclusive promotion blocks the promotions after it but not those before": before it by id.
test("[boundary-5] an exclusive promotion second by id among equal priorities applies after the first and blocks the rest", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [percent("c-plain", 10, 1, false), fixed("b-excl", 100, 1, true), percent("a-plain", 50, 1, false)],
  );

  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "a-plain", amount: 500 },
    { promotionId: "b-excl", amount: 100 },
  ]);
  assert.equal(cart.lines[0].total, 400);
  assert.equal(cart.total, 400);
});

// Extends public "[boundary-5] ...blocks the promotions after it": an exclusive promotion reported with 0 on a line at 0 still ends it.
test("[boundary-5] an exclusive promotion applied with 0 on a line at 0 still blocks the promotions after it", () => {
  const cart = priceCart(
    [line("sku-2", 300, 2)],
    [percent("after", 10, 3, false), percent("excl", 20, 2, true), fixed("big", 500, 1, false)],
  );

  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "big", amount: 600 },
    { promotionId: "excl", amount: 0 },
  ]);
  assert.equal(cart.lines[0].total, 0);
  assert.equal(cart.total, 0);
});

// Extends public "[boundary-5] ...blocks the promotions after it": each line is ended by its own exclusive promotion.
test("[boundary-5] lines matched by different exclusive promotions are each ended at their own one", () => {
  const cart = priceCart(
    [line("early", 1000, 1, ["e"]), line("late", 1000, 1, ["l"]), line("none", 1000, 1)],
    [
      percent("p1", 10, 1, false),
      fixed("excl-e", 100, 2, true, "e"),
      percent("p3", 20, 3, false),
      fixed("excl-l", 50, 4, true, "l"),
      fixed("p5", 30, 5, false),
    ],
  );

  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "p1", amount: 100 },
    { promotionId: "excl-e", amount: 100 },
  ]);
  assert.equal(cart.lines[0].total, 800);
  assert.deepEqual(cart.lines[1].promotions, [
    { promotionId: "p1", amount: 100 },
    { promotionId: "p3", amount: 180 },
    { promotionId: "excl-l", amount: 50 },
  ]);
  assert.equal(cart.lines[1].total, 670);
  assert.deepEqual(cart.lines[2].promotions, [
    { promotionId: "p1", amount: 100 },
    { promotionId: "p3", amount: 180 },
    { promotionId: "p5", amount: 30 },
  ]);
  assert.equal(cart.lines[2].total, 690);
  assert.equal(cart.total, 2160);
});

// Extends public "[boundary-6] of two exclusive promotions matching a line, only the earlier one applies": three of them.
test("[boundary-6] of three exclusive promotions matching a line, only the earliest in priority applies", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 2)],
    [percent("prio-3", 50, 3, true), fixed("prio-1", 100, 1, true), percent("prio-2", 10, 2, true)],
  );

  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "prio-1", amount: 200 }]);
  assert.equal(cart.lines[0].total, 1800);
  assert.equal(cart.total, 1800);
});

// Extends public "[boundary-6] of two exclusive promotions matching a line, only the earlier one applies": earlier by id.
test("[boundary-6] of two exclusive promotions with equal priority, only the one whose id sorts first applies", () => {
  const cart = priceCart(
    [line("sku-1", 1000, 1)],
    [percent("excl-b", 50, 4, true), fixed("excl-a", 100, 4, true)],
  );

  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "excl-a", amount: 100 }]);
  assert.equal(cart.lines[0].total, 900);
  assert.equal(cart.total, 900);
});

// Extends public "[boundary-6] a skipped exclusive promotion still applies to another line that only it matches": more lines, other kinds.
test("[boundary-6] an exclusive promotion skipped on one line applies on the lines where it is the first exclusive", () => {
  const cart = priceCart(
    [line("y-only", 600, 3, ["y"]), line("x-and-y", 1000, 2, ["x", "y"]), line("y-too", 400, 3, ["y"])],
    [bundle("excl-y", 2, 1, 5, true, "y"), percent("excl-x", 25, 1, true, "x")],
  );

  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "excl-y", amount: 600 }]);
  assert.equal(cart.lines[0].total, 1200);
  assert.deepEqual(cart.lines[1].promotions, [{ promotionId: "excl-x", amount: 500 }]);
  assert.equal(cart.lines[1].total, 1500);
  assert.deepEqual(cart.lines[2].promotions, [{ promotionId: "excl-y", amount: 400 }]);
  assert.equal(cart.lines[2].total, 800);
  assert.equal(cart.total, 3500);
});

// Extends public "[boundary-6] ...still applies to another line": an exclusive promotion applies after several non-exclusive ones.
test("[boundary-6] an exclusive promotion applies after two non-exclusive ones and the exclusive after it is skipped", () => {
  const cart = priceCart(
    [line("sku-1", 2000, 1)],
    [
      fixed("excl-late", 300, 9, true),
      percent("plain-1", 10, 1, false),
      fixed("excl-first", 100, 5, true),
      fixed("plain-2", 200, 2, false),
    ],
  );

  assert.deepEqual(cart.lines[0].promotions, [
    { promotionId: "plain-1", amount: 200 },
    { promotionId: "plain-2", amount: 200 },
    { promotionId: "excl-first", amount: 100 },
  ]);
  assert.equal(cart.lines[0].total, 1500);
  assert.equal(cart.total, 1500);
});
