import { test } from "node:test";
import assert from "node:assert/strict";
import { priceCart } from "../../src/index.js";
import type { CartLine, Promotion } from "../../src/index.js";

function line(productId: string, unitPrice: number, quantity: number, tags: string[] = []): CartLine {
  return { productId, unitPrice, quantity, tags };
}

function threshold(id: string, minimum: number, amount: number, priority = 1): Promotion {
  return { id, priority, exclusive: false, kind: "threshold", minimum, amount };
}

function percent(id: string, value: number, priority: number, exclusive: boolean, tag?: string): Promotion {
  return { id, priority, exclusive, kind: "percent", percent: value, ...(tag === undefined ? {} : { tag }) };
}

// Extends public "[happy-4] a threshold whose minimum is one cent above the subtotal...": the subtotal before line promotions would qualify.
test("[happy-4] a threshold met only by the subtotal before line promotions is not applied", () => {
  const cart = priceCart(
    [line("credits", 3000, 2, ["credits"]), line("extra", 500, 1)],
    [threshold("spend-5000", 5000, 500), percent("half", 50, 1, false, "credits")],
  );

  assert.equal(cart.lines[0].total, 3000);
  assert.equal(cart.lines[1].total, 500);
  assert.deepEqual(cart.orderPromotions, []);
  assert.equal(cart.total, 3500);
});

// Extends public "[happy-4] a threshold met by the subtotal after line promotions comes off the order": rounded line totals sum to the minimum.
test("[happy-4] a threshold is met by line totals that reach the minimum after rounding", () => {
  const cart = priceCart(
    [line("rounded", 101, 1, ["p"]), line("rest", 4932, 1)],
    [percent("p33", 33, 1, false, "p"), threshold("spend-5000", 5000, 500, 2)],
  );

  assert.equal(cart.lines[0].total, 68);
  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "p33", amount: 33 }]);
  assert.equal(cart.lines[1].total, 4932);
  assert.deepEqual(cart.lines[1].promotions, []);
  assert.deepEqual(cart.orderPromotions, [{ promotionId: "spend-5000", amount: 500 }]);
  assert.equal(cart.total, 4500);
});

// Extends public "[happy-4] a threshold met by the subtotal...": more lines, no line promotions, the threshold is not reported on lines.
test("[happy-4] a threshold over several lines comes off the order and is reported on no line", () => {
  const cart = priceCart(
    [line("a", 1000, 3), line("b", 2500, 1, ["credits"]), line("c", 750, 2)],
    [threshold("spend-6000", 6000, 750, 1)],
  );

  for (const priced of cart.lines) {
    assert.deepEqual(priced.promotions, []);
  }
  assert.deepEqual(
    cart.lines.map((l) => l.total),
    [3000, 2500, 1500],
  );
  assert.deepEqual(cart.orderPromotions, [{ promotionId: "spend-6000", amount: 750 }]);
  assert.equal(cart.total, 6250);
});

// Extends public "[happy-4] ...one cent above the subtotal is not applied": the boundary at other values, both sides.
test("[happy-4] a threshold at exactly the subtotal applies and one a cent above does not", () => {
  const cart = priceCart(
    [line("a", 4115, 3)],
    [threshold("above", 12346, 2000, 1), threshold("exact", 12345, 345, 2)],
  );

  assert.deepEqual(cart.orderPromotions, [{ promotionId: "exact", amount: 345 }]);
  assert.equal(cart.total, 12000);
});

// Extends public "[happy-4] a threshold met by the subtotal...": an exclusive line promotion ends only the line's promotions, not the order's.
test("[happy-4] a threshold still applies when an exclusive line promotion applied", () => {
  const cart = priceCart(
    [line("sku-1", 5000, 1)],
    [threshold("spend-4000", 4000, 400, 2), percent("excl", 10, 1, true), threshold("spend-1000", 1000, 100, 0)],
  );

  assert.deepEqual(cart.lines[0].promotions, [{ promotionId: "excl", amount: 500 }]);
  assert.equal(cart.lines[0].total, 4500);
  assert.deepEqual(cart.orderPromotions, [
    { promotionId: "spend-1000", amount: 100 },
    { promotionId: "spend-4000", amount: 400 },
  ]);
  assert.equal(cart.total, 4000);
});

// Extends public "[boundary-7] every qualifying threshold applies, in priority order": more thresholds, one not qualifying, ties by id.
test("[boundary-7] of four thresholds the three qualifying apply in priority then id order against the same subtotal", () => {
  const cart = priceCart(
    [line("sale", 4000, 2, ["sale"]), line("plain", 2000, 2)],
    [
      threshold("t3", 10000, 1000, 3),
      threshold("t2", 10001, 5000, 2),
      threshold("t0", 9000, 300, 3),
      threshold("t1", 5000, 600, 1),
      percent("sale-25", 25, 1, false, "sale"),
    ],
  );

  assert.equal(cart.lines[0].total, 6000);
  assert.equal(cart.lines[1].total, 4000);
  assert.deepEqual(cart.orderPromotions, [
    { promotionId: "t1", amount: 600 },
    { promotionId: "t0", amount: 300 },
    { promotionId: "t3", amount: 1000 },
  ]);
  assert.equal(cart.total, 8100);
});

// Extends public "[boundary-7] every qualifying threshold applies, in priority order": priorities compared as numbers.
test("[boundary-7] thresholds with priorities 2, 9 and 10 apply in numeric order", () => {
  const cart = priceCart(
    [line("big", 10000, 1)],
    [threshold("p10", 1000, 10, 10), threshold("p2", 1000, 20, 2), threshold("p9", 1000, 30, 9)],
  );

  assert.deepEqual(cart.orderPromotions, [
    { promotionId: "p2", amount: 20 },
    { promotionId: "p9", amount: 30 },
    { promotionId: "p10", amount: 10 },
  ]);
  assert.equal(cart.total, 9940);
});

// Extends public "[boundary-7] a later threshold is judged against the subtotal, not what earlier thresholds left": the later one sits exactly at the subtotal.
test("[boundary-7] a threshold whose minimum equals the subtotal applies after another threshold took the total below it", () => {
  const cart = priceCart(
    [line("a", 2500, 2), line("b", 1000, 2)],
    [threshold("second", 7000, 700, 2), threshold("first", 1000, 1500, 1)],
  );

  assert.deepEqual(cart.orderPromotions, [
    { promotionId: "first", amount: 1500 },
    { promotionId: "second", amount: 700 },
  ]);
  assert.equal(cart.total, 4800);
});

// Extends public "[boundary-7] the order total never goes below 0": several lines, line totals unaffected.
test("[boundary-7] thresholds worth more than the subtotal leave the order total at 0 and the line totals as they were", () => {
  const cart = priceCart(
    [line("a", 1000, 2), line("b", 500, 2)],
    [threshold("t-1", 1000, 2000, 1), threshold("t-2", 3000, 2000, 2)],
  );

  assert.equal(cart.lines[0].total, 2000);
  assert.equal(cart.lines[1].total, 1000);
  assert.equal(cart.total, 0);
});

// Extends public "[boundary-7] the order total never goes below 0": a single threshold larger than the subtotal.
test("[boundary-7] a single threshold larger than the subtotal leaves the order total at 0", () => {
  const cart = priceCart([line("small", 300, 1)], [threshold("huge", 100, 5000, 1)]);

  assert.equal(cart.lines[0].total, 300);
  assert.equal(cart.total, 0);
});
