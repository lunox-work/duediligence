import { test } from "node:test";
import assert from "node:assert/strict";
import { priceCart, type CartLine } from "../../src/index.js";

// Extends public: an untagged percentage discounts the entire line total.
test("[happy-1] a percentage handles many differently sized lines in cart order", () => {
  const lines: CartLine[] = Array.from({ length: 24 }, (_, i) => ({
    productId: `product-${24 - i}`, unitPrice: 120 * (i + 1), quantity: i + 2,
    tags: i % 2 ? ["featured"] : [],
  }));
  const expected = lines.map((line) => ({
    productId: line.productId,
    total: line.unitPrice * line.quantity * 3 / 4,
    promotions: [{ promotionId: "quarter", amount: line.unitPrice * line.quantity / 4 }],
  }));
  assert.deepEqual(priceCart(lines, [
    { id: "quarter", priority: 4, exclusive: false, kind: "percent", percent: 25 },
  ]), { lines: expected, orderPromotions: [], total: expected.reduce((sum, line) => sum + line.total, 0) });
});

// Extends public: a tagged percentage only discounts lines carrying its tag.
test("[happy-1] tag membership is exact and can occur after several unrelated tags", () => {
  assert.deepEqual(priceCart([
    { productId: "match", unitPrice: 800, quantity: 5, tags: ["a", "b", "sale", "c"] },
    { productId: "prefix", unitPrice: 800, quantity: 2, tags: ["wholesale"] },
    { productId: "case", unitPrice: 800, quantity: 1, tags: ["Sale"] },
    { productId: "bare", unitPrice: 800, quantity: 3, tags: [] },
  ], [{ id: "tagged", priority: 2, exclusive: false, kind: "percent", percent: 25, tag: "sale" }]), {
    lines: [
      { productId: "match", total: 3000, promotions: [{ promotionId: "tagged", amount: 1000 }] },
      { productId: "prefix", total: 1600, promotions: [] },
      { productId: "case", total: 800, promotions: [] },
      { productId: "bare", total: 2400, promotions: [] },
    ], orderPromotions: [], total: 7800,
  });
});

test("[happy-1] repeated product ids still produce one separately priced line per input", () => {
  assert.deepEqual(priceCart([
    { productId: "repeat", unitPrice: 320, quantity: 3, tags: ["offer"] },
    { productId: "middle", unitPrice: 75, quantity: 4, tags: [] },
    { productId: "repeat", unitPrice: 150, quantity: 2, tags: [] },
  ], [{ id: "offer", priority: 1, exclusive: false, tag: "offer", kind: "percent", percent: 25 }]), {
    lines: [
      { productId: "repeat", total: 720, promotions: [{ promotionId: "offer", amount: 240 }] },
      { productId: "middle", total: 300, promotions: [] },
      { productId: "repeat", total: 300, promotions: [] },
    ], orderPromotions: [], total: 1320,
  });
});

test("[happy-1] a cart without promotions preserves all line totals", () => {
  assert.deepEqual(priceCart([
    { productId: "last-id", unitPrice: 123, quantity: 19, tags: ["x"] },
    { productId: "first-id", unitPrice: 456, quantity: 7, tags: [] },
  ], []), {
    lines: [
      { productId: "last-id", total: 2337, promotions: [] },
      { productId: "first-id", total: 3192, promotions: [] },
    ], orderPromotions: [], total: 5529,
  });
});

test("[happy-1] an explicitly empty tag matches only lines containing that tag", () => {
  assert.deepEqual(priceCart([
    { productId: "empty-tag", unitPrice: 240, quantity: 3, tags: ["x", ""] },
    { productId: "no-tags", unitPrice: 240, quantity: 3, tags: [] },
    { productId: "other-tag", unitPrice: 240, quantity: 3, tags: ["x"] },
  ], [{ id: "empty-tag-offer", priority: 1, exclusive: false, tag: "", kind: "percent", percent: 25 }]), {
    lines: [
      { productId: "empty-tag", total: 540, promotions: [{ promotionId: "empty-tag-offer", amount: 180 }] },
      { productId: "no-tags", total: 720, promotions: [] },
      { productId: "other-tag", total: 720, promotions: [] },
    ], orderPromotions: [], total: 1980,
  });
});

test("[happy-1] a fractional percentage and an ordinary string id remain valid", () => {
  assert.deepEqual(priceCart([{ productId: "eighth", unitPrice: 199, quantity: 8, tags: [] }], [
    { id: "constructor", priority: 1, exclusive: false, kind: "percent", percent: 12.5 },
  ]), {
    lines: [{ productId: "eighth", total: 1393, promotions: [{ promotionId: "constructor", amount: 199 }] }],
    orderPromotions: [], total: 1393,
  });
});

// Extends public: a tagged fixed promotion discounts every matching unit.
test("[happy-2] overlapping fixed promotions multiply by each line's own quantity", () => {
  assert.deepEqual(priceCart([
    { productId: "both", unitPrice: 900, quantity: 7, tags: ["x", "y"] },
    { productId: "only-x", unitPrice: 600, quantity: 3, tags: ["x"] },
    { productId: "neither", unitPrice: 400, quantity: 2, tags: ["xy"] },
  ], [
    { id: "y-off", priority: 2, exclusive: false, tag: "y", kind: "fixed", amount: 80 },
    { id: "x-off", priority: 1, exclusive: false, tag: "x", kind: "fixed", amount: 125 },
  ]), {
    lines: [
      { productId: "both", total: 4865, promotions: [{ promotionId: "x-off", amount: 875 }, { promotionId: "y-off", amount: 560 }] },
      { productId: "only-x", total: 1425, promotions: [{ promotionId: "x-off", amount: 375 }] },
      { productId: "neither", total: 800, promotions: [] },
    ], orderPromotions: [], total: 7090,
  });
});

// Extends public: a fixed discount equal to the unit price makes the line free.
test("[happy-2] an untagged fixed discount exactly consumes a larger multiunit line", () => {
  assert.deepEqual(priceCart([
    { productId: "all-free", unitPrice: 137, quantity: 17, tags: [] },
    { productId: "part-paid", unitPrice: 200, quantity: 3, tags: ["other"] },
  ], [{ id: "each-unit", priority: 1, exclusive: false, kind: "fixed", amount: 137 }]), {
    lines: [
      { productId: "all-free", total: 0, promotions: [{ promotionId: "each-unit", amount: 2329 }] },
      { productId: "part-paid", total: 189, promotions: [{ promotionId: "each-unit", amount: 411 }] },
    ], orderPromotions: [], total: 189,
  });
});

// Extends public: a bundle discounts full groups and leaves the remainder paid.
test("[happy-3] a tagged bundle can give several free units per group", () => {
  assert.deepEqual(priceCart([
    { productId: "bulk", unitPrice: 345, quantity: 14, tags: ["x", "bulk"] },
    { productId: "excluded", unitPrice: 345, quantity: 14, tags: [] },
  ], [{ id: "three-plus-two", priority: 3, exclusive: false, tag: "bulk", kind: "bundle", buy: 3, free: 2 }]), {
    lines: [
      { productId: "bulk", total: 3450, promotions: [{ promotionId: "three-plus-two", amount: 1380 }] },
      { productId: "excluded", total: 4830, promotions: [] },
    ], orderPromotions: [], total: 8280,
  });
});

// Extends public: a bundle discounts exactly one group at the qualifying quantity.
test("[happy-3] bundle group boundaries use buy plus free and do not pool lines", () => {
  const result = priceCart([4, 5, 6, 15].map((quantity) => ({
    productId: `quantity-${quantity}`, unitPrice: 120, quantity, tags: [],
  })), [{ id: "group-five", priority: 1, exclusive: false, kind: "bundle", buy: 3, free: 2 }]);
  assert.deepEqual(result.lines.map((line) => ({ productId: line.productId, total: line.total })), [
    { productId: "quantity-4", total: 480 },
    { productId: "quantity-5", total: 360 },
    { productId: "quantity-6", total: 480 },
    { productId: "quantity-15", total: 1080 },
  ]);
  assert.deepEqual(result.lines[3].promotions, [{ promotionId: "group-five", amount: 720 }]);
  assert.deepEqual(result.orderPromotions, []);
  assert.equal(result.total, 2400);
});

test("[happy-3] a large bundle quantity discounts every complete group", () => {
  assert.deepEqual(priceCart([{ productId: "large-cart-line", unitPrice: 17, quantity: 100003, tags: [] }], [
    { id: "four-plus-three", priority: 1, exclusive: false, kind: "bundle", buy: 4, free: 3 },
  ]), {
    lines: [{ productId: "large-cart-line", total: 971465, promotions: [{ promotionId: "four-plus-three", amount: 728586 }] }],
    orderPromotions: [], total: 971465,
  });
});

// Extends public: priority orders promotions before each uses the remaining total.
test("[boundary-1] a reversed four-promotion chain uses numeric priorities and every intermediate total", () => {
  assert.deepEqual(priceCart([{ productId: "chain", unitPrice: 1000, quantity: 3, tags: [] }], [
    { id: "a-last", priority: 10, exclusive: false, kind: "percent", percent: 20 },
    { id: "b-third", priority: 3, exclusive: false, kind: "fixed", amount: 50 },
    { id: "c-second", priority: 2, exclusive: false, kind: "percent", percent: 25 },
    { id: "z-first", priority: 1, exclusive: false, kind: "fixed", amount: 100 },
  ]), {
    lines: [{ productId: "chain", total: 1500, promotions: [
      { promotionId: "z-first", amount: 300 },
      { promotionId: "c-second", amount: 675 },
      { promotionId: "b-third", amount: 150 },
      { promotionId: "a-last", amount: 375 },
    ] }], orderPromotions: [], total: 1500,
  });
});

// Extends public: equal priorities use id order rather than input order.
test("[boundary-1] equal-priority ids sort across a longer mixed-kind chain", () => {
  assert.deepEqual(priceCart([{ productId: "tie", unitPrice: 500, quantity: 8, tags: [] }], [
    { id: "delta", priority: 7, exclusive: false, kind: "percent", percent: 25 },
    { id: "charlie", priority: 7, exclusive: false, kind: "bundle", buy: 1, free: 1 },
    { id: "bravo", priority: 7, exclusive: false, kind: "percent", percent: 50 },
    { id: "alpha", priority: 7, exclusive: false, kind: "fixed", amount: 100 },
  ]), {
    lines: [{ productId: "tie", total: 600, promotions: [
      { promotionId: "alpha", amount: 800 }, { promotionId: "bravo", amount: 1600 },
      { promotionId: "charlie", amount: 800 }, { promotionId: "delta", amount: 200 },
    ] }], orderPromotions: [], total: 600,
  });
});

// Extends public: a bundle values free units after an earlier percentage.
test("[boundary-2] a bundle uses the unit value left by both fixed and percentage discounts", () => {
  assert.deepEqual(priceCart([{ productId: "current", unitPrice: 900, quantity: 10, tags: [] }], [
    { id: "bundle", priority: 3, exclusive: false, kind: "bundle", buy: 3, free: 2 },
    { id: "percent", priority: 2, exclusive: false, kind: "percent", percent: 25 },
    { id: "fixed", priority: 1, exclusive: false, kind: "fixed", amount: 100 },
  ]), {
    lines: [{ productId: "current", total: 3600, promotions: [
      { promotionId: "fixed", amount: 1000 }, { promotionId: "percent", amount: 2000 },
      { promotionId: "bundle", amount: 2400 },
    ] }], orderPromotions: [], total: 3600,
  });
});

// Extends public: a bundle rounds a half-cent current free-unit value up.
test("[boundary-2] bundle discount rounds the combined free-unit value rather than each unit", () => {
  assert.deepEqual(priceCart([{ productId: "fractional-units", unitPrice: 101, quantity: 6, tags: [] }], [
    { id: "half", priority: 1, exclusive: false, kind: "percent", percent: 50 },
    { id: "two-free", priority: 2, exclusive: false, kind: "bundle", buy: 2, free: 1 },
  ]), {
    lines: [{ productId: "fractional-units", total: 202, promotions: [
      { promotionId: "half", amount: 303 }, { promotionId: "two-free", amount: 101 },
    ] }], orderPromotions: [], total: 202,
  });
});

test("[boundary-2] consecutive bundles recompute unit value from the remaining total", () => {
  assert.deepEqual(priceCart([{ productId: "two-bundles", unitPrice: 400, quantity: 12, tags: [] }], [
    { id: "first", priority: 1, exclusive: false, kind: "bundle", buy: 2, free: 1 },
    { id: "second", priority: 2, exclusive: false, kind: "bundle", buy: 1, free: 1 },
  ]), {
    lines: [{ productId: "two-bundles", total: 1600, promotions: [
      { promotionId: "first", amount: 1600 }, { promotionId: "second", amount: 1600 },
    ] }], orderPromotions: [], total: 1600,
  });
});

test("[boundary-2] a bundle uses the rounded previous total without truncating its fractional unit value", () => {
  assert.deepEqual(priceCart([{ productId: "fractional-remainder", unitPrice: 101, quantity: 7, tags: [] }], [
    { id: "half", priority: 1, exclusive: false, kind: "percent", percent: 50 },
    { id: "bundle", priority: 2, exclusive: false, kind: "bundle", buy: 2, free: 1 },
  ]), {
    lines: [{ productId: "fractional-remainder", total: 252, promotions: [
      { promotionId: "half", amount: 354 }, { promotionId: "bundle", amount: 101 },
    ] }], orderPromotions: [], total: 252,
  });
});

// Extends public: a percentage discount below half a cent rounds down.
test("[boundary-3] rounding happens on the whole line discount rather than per unit", () => {
  assert.deepEqual(priceCart([{ productId: "aggregate", unitPrice: 101, quantity: 3, tags: [] }], [
    { id: "third", priority: 1, exclusive: false, kind: "percent", percent: 33 },
  ]), {
    lines: [{ productId: "aggregate", total: 203, promotions: [{ promotionId: "third", amount: 100 }] }],
    orderPromotions: [], total: 203,
  });
});

// Extends public: a percentage discount at exactly half a cent rounds up.
test("[boundary-3] half-up rounding applies separately at every step of a percent chain", () => {
  assert.deepEqual(priceCart([{ productId: "round-each", unitPrice: 5, quantity: 1, tags: [] }], [
    { id: "first", priority: 1, exclusive: false, kind: "percent", percent: 50 },
    { id: "second", priority: 2, exclusive: false, kind: "percent", percent: 25 },
    { id: "third", priority: 3, exclusive: false, kind: "percent", percent: 50 },
  ]), {
    lines: [{ productId: "round-each", total: 0, promotions: [
      { promotionId: "first", amount: 3 }, { promotionId: "second", amount: 1 },
      { promotionId: "third", amount: 1 },
    ] }], orderPromotions: [], total: 0,
  });
});

test("[boundary-3] discounts just below and above half a cent round in opposite directions", () => {
  assert.deepEqual(priceCart([
    { productId: "below", unitPrice: 49, quantity: 1, tags: [] },
    { productId: "above", unitPrice: 51, quantity: 1, tags: [] },
  ], [{ id: "one-percent", priority: 1, exclusive: false, kind: "percent", percent: 1 }]).lines.map((line) => line.total), [49, 50]);
});

// Extends public: an oversized fixed discount reports only the amount available.
test("[boundary-4] fixed discounts are capped by the remaining total after a percent", () => {
  assert.deepEqual(priceCart([{ productId: "cap-remaining", unitPrice: 400, quantity: 5, tags: [] }], [
    { id: "percent", priority: 1, exclusive: false, kind: "percent", percent: 75 },
    { id: "fixed", priority: 2, exclusive: false, kind: "fixed", amount: 200 },
  ]), {
    lines: [{ productId: "cap-remaining", total: 0, promotions: [
      { promotionId: "percent", amount: 1500 }, { promotionId: "fixed", amount: 500 },
    ] }], orderPromotions: [], total: 0,
  });
});

// Extends public: matching promotions after the line reaches zero are still reported.
test("[boundary-4] zero totals keep only matching promotions while other lines continue normally", () => {
  assert.deepEqual(priceCart([
    { productId: "free", unitPrice: 250, quantity: 4, tags: ["free"] },
    { productId: "paid", unitPrice: 250, quantity: 4, tags: [] },
  ], [
    { id: "wipe", priority: 1, exclusive: false, tag: "free", kind: "percent", percent: 100 },
    { id: "absent", priority: 2, exclusive: false, tag: "absent", kind: "fixed", amount: 80 },
    { id: "bundle", priority: 3, exclusive: false, kind: "bundle", buy: 1, free: 1 },
    { id: "fixed", priority: 4, exclusive: false, kind: "fixed", amount: 25 },
  ]), {
    lines: [
      { productId: "free", total: 0, promotions: [{ promotionId: "wipe", amount: 1000 }, { promotionId: "bundle", amount: 0 }, { promotionId: "fixed", amount: 0 }] },
      { productId: "paid", total: 400, promotions: [{ promotionId: "bundle", amount: 500 }, { promotionId: "fixed", amount: 100 }] },
    ], orderPromotions: [], total: 400,
  });
});
