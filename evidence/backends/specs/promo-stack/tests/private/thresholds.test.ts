import { test } from "node:test";
import assert from "node:assert/strict";
import { priceCart } from "../../src/index.js";

// Extends public: a threshold exactly met after line discounts applies to the order.
test("[happy-4] thresholds see the subtotal after different tagged line chains finish", () => {
  assert.deepEqual(priceCart([
    { productId: "percent-line", unitPrice: 800, quantity: 3, tags: ["percent"] },
    { productId: "fixed-line", unitPrice: 600, quantity: 4, tags: ["fixed"] },
    { productId: "bundle-line", unitPrice: 200, quantity: 6, tags: ["bundle"] },
    { productId: "plain", unitPrice: 100, quantity: 2, tags: [] },
  ], [
    { id: "exact", priority: 1, exclusive: false, kind: "threshold", minimum: 4800, amount: 300 },
    { id: "percent", priority: 10, exclusive: false, tag: "percent", kind: "percent", percent: 25 },
    { id: "fixed", priority: 20, exclusive: false, tag: "fixed", kind: "fixed", amount: 100 },
    { id: "bundle", priority: 30, exclusive: false, tag: "bundle", kind: "bundle", buy: 2, free: 1 },
  ]), {
    lines: [
      { productId: "percent-line", total: 1800, promotions: [{ promotionId: "percent", amount: 600 }] },
      { productId: "fixed-line", total: 2000, promotions: [{ promotionId: "fixed", amount: 400 }] },
      { productId: "bundle-line", total: 800, promotions: [{ promotionId: "bundle", amount: 400 }] },
      { productId: "plain", total: 200, promotions: [] },
    ], orderPromotions: [{ promotionId: "exact", amount: 300 }], total: 4500,
  });
});

// Extends public: a threshold one cent above the discounted subtotal is not reported.
test("[happy-4] below equal and above thresholds compare to the rounded discounted subtotal", () => {
  assert.deepEqual(priceCart([{ productId: "rounded", unitPrice: 101, quantity: 3, tags: [] }], [
    { id: "above", priority: 1, exclusive: false, kind: "threshold", minimum: 204, amount: 50 },
    { id: "below", priority: 2, exclusive: false, kind: "threshold", minimum: 202, amount: 20 },
    { id: "equal", priority: 3, exclusive: false, kind: "threshold", minimum: 203, amount: 30 },
    { id: "line", priority: 4, exclusive: false, kind: "percent", percent: 33 },
  ]), {
    lines: [{ productId: "rounded", total: 203, promotions: [{ promotionId: "line", amount: 100 }] }],
    orderPromotions: [{ promotionId: "below", amount: 20 }, { promotionId: "equal", amount: 30 }], total: 153,
  });
});

test("[happy-4] a large original subtotal does not qualify after line exclusivity has run", () => {
  assert.deepEqual(priceCart([{ productId: "exclusive-line", unitPrice: 1000, quantity: 4, tags: [] }], [
    { id: "too-high", priority: 1, exclusive: false, kind: "threshold", minimum: 3000, amount: 700 },
    { id: "met", priority: 2, exclusive: false, kind: "threshold", minimum: 2000, amount: 300 },
    { id: "half-stop", priority: 3, exclusive: true, kind: "percent", percent: 50 },
    { id: "blocked-line", priority: 4, exclusive: false, kind: "fixed", amount: 100 },
  ]), {
    lines: [{ productId: "exclusive-line", total: 2000, promotions: [{ promotionId: "half-stop", amount: 2000 }] }],
    orderPromotions: [{ promotionId: "met", amount: 300 }], total: 1700,
  });
});

test("[happy-4] an empty cart with no promotions has no lines and zero total", () => {
  assert.deepEqual(priceCart([], []), { lines: [], orderPromotions: [], total: 0 });
});

// Extends public: qualifying thresholds apply in priority then id order.
test("[boundary-7] five thresholds mix numeric priorities id ties and an unqualified promotion", () => {
  assert.deepEqual(priceCart([{ productId: "order", unitPrice: 1700, quantity: 5, tags: [] }], [
    { id: "delta", priority: 10, exclusive: false, kind: "threshold", minimum: 8500, amount: 400 },
    { id: "charlie", priority: 2, exclusive: false, kind: "threshold", minimum: 7000, amount: 300 },
    { id: "absent", priority: 1, exclusive: false, kind: "threshold", minimum: 8501, amount: 2000 },
    { id: "alpha", priority: 2, exclusive: false, kind: "threshold", minimum: 6000, amount: 100 },
    { id: "bravo", priority: 2, exclusive: false, kind: "threshold", minimum: 8000, amount: 200 },
  ]), {
    lines: [{ productId: "order", total: 8500, promotions: [] }],
    orderPromotions: [
      { promotionId: "alpha", amount: 100 }, { promotionId: "bravo", amount: 200 },
      { promotionId: "charlie", amount: 300 }, { promotionId: "delta", amount: 400 },
    ], total: 7500,
  });
});

// Extends public: later thresholds qualify against the subtotal before any order discounts.
test("[boundary-7] all four exact-subtotal thresholds qualify after successive order reductions", () => {
  assert.deepEqual(priceCart([
    { productId: "one", unitPrice: 700, quantity: 3, tags: [] },
    { productId: "two", unitPrice: 300, quantity: 3, tags: [] },
  ], [
    { id: "d", priority: 4, exclusive: false, kind: "threshold", minimum: 3000, amount: 250 },
    { id: "b", priority: 2, exclusive: false, kind: "threshold", minimum: 3000, amount: 500 },
    { id: "a", priority: 1, exclusive: false, kind: "threshold", minimum: 3000, amount: 1000 },
    { id: "c", priority: 3, exclusive: false, kind: "threshold", minimum: 3000, amount: 750 },
  ]), {
    lines: [{ productId: "one", total: 2100, promotions: [] }, { productId: "two", total: 900, promotions: [] }],
    orderPromotions: [{ promotionId: "a", amount: 1000 }, { promotionId: "b", amount: 500 }, { promotionId: "c", amount: 750 }, { promotionId: "d", amount: 250 }],
    total: 500,
  });
});

// Extends public: combined qualifying thresholds cannot make the order total negative.
test("[boundary-7] even thresholds after an oversized order discount must still be reported", () => {
  const result = priceCart([{ productId: "capped-order", unitPrice: 275, quantity: 4, tags: [] }], [
    { id: "third", priority: 3, exclusive: false, kind: "threshold", minimum: 1100, amount: 30 },
    { id: "first", priority: 1, exclusive: false, kind: "threshold", minimum: 1000, amount: 5000 },
    { id: "second", priority: 2, exclusive: false, kind: "threshold", minimum: 1100, amount: 50 },
  ]);
  assert.deepEqual(result.lines, [{ productId: "capped-order", total: 1100, promotions: [] }]);
  // Whether order amounts are capped individually is unspecified.
  assert.deepEqual(result.orderPromotions.map((promotion) => promotion.promotionId), ["first", "second", "third"]);
  assert.equal(result.total, 0);
});

test("[boundary-7] order discounts exactly consuming the subtotal leave zero without changing lines", () => {
  assert.deepEqual(priceCart([{ productId: "exact-zero", unitPrice: 240, quantity: 5, tags: [] }], [
    { id: "one", priority: 1, exclusive: false, kind: "threshold", minimum: 1200, amount: 700 },
    { id: "two", priority: 2, exclusive: false, kind: "threshold", minimum: 1200, amount: 500 },
  ]), {
    lines: [{ productId: "exact-zero", total: 1200, promotions: [] }],
    orderPromotions: [{ promotionId: "one", amount: 700 }, { promotionId: "two", amount: 500 }], total: 0,
  });
});

test("[boundary-7] a zero subtotal meets zero-minimum thresholds and excludes positive minima", () => {
  const result = priceCart([{ productId: "empty-line", unitPrice: 800, quantity: 0, tags: [] }], [
    { id: "positive-minimum", priority: 1, exclusive: false, kind: "threshold", minimum: 1, amount: 10 },
    { id: "zero-first", priority: 2, exclusive: false, kind: "threshold", minimum: 0, amount: 50 },
    { id: "zero-second", priority: 3, exclusive: false, kind: "threshold", minimum: 0, amount: 100 },
  ]);
  assert.deepEqual(result.lines, [{ productId: "empty-line", total: 0, promotions: [] }]);
  assert.deepEqual(result.orderPromotions.map((promotion) => promotion.promotionId), ["zero-first", "zero-second"]);
  assert.equal(result.total, 0);
});
