import { test } from "node:test";
import assert from "node:assert/strict";
import { priceCart } from "../../src/index.js";

// Extends public: an exclusive promotion applies after earlier promotions and blocks later ones.
test("[boundary-5] an exclusive bundle ends a longer chain after two ordinary discounts", () => {
  assert.deepEqual(priceCart([{ productId: "bundle-stop", unitPrice: 600, quantity: 6, tags: [] }], [
    { id: "late-fixed", priority: 5, exclusive: false, kind: "fixed", amount: 80 },
    { id: "late-percent", priority: 4, exclusive: false, kind: "percent", percent: 50 },
    { id: "stop", priority: 3, exclusive: true, kind: "bundle", buy: 2, free: 1 },
    { id: "fixed", priority: 2, exclusive: false, kind: "fixed", amount: 50 },
    { id: "half", priority: 1, exclusive: false, kind: "percent", percent: 50 },
  ]), {
    lines: [{ productId: "bundle-stop", total: 1000, promotions: [
      { promotionId: "half", amount: 1800 }, { promotionId: "fixed", amount: 300 },
      { promotionId: "stop", amount: 500 },
    ] }], orderPromotions: [], total: 1000,
  });
});

// Extends public: an exclusive promotion first in order is the only one applied.
test("[boundary-5] a tagged exclusive percent blocks only the matching line", () => {
  assert.deepEqual(priceCart([
    { productId: "selected", unitPrice: 400, quantity: 5, tags: ["vip"] },
    { productId: "ordinary", unitPrice: 400, quantity: 5, tags: [] },
  ], [
    { id: "later-bundle", priority: 3, exclusive: false, kind: "bundle", buy: 2, free: 1 },
    { id: "later-fixed", priority: 2, exclusive: false, kind: "fixed", amount: 40 },
    { id: "vip", priority: 1, exclusive: true, tag: "vip", kind: "percent", percent: 25 },
  ]), {
    lines: [
      { productId: "selected", total: 1500, promotions: [{ promotionId: "vip", amount: 500 }] },
      { productId: "ordinary", total: 1440, promotions: [{ promotionId: "later-fixed", amount: 200 }, { promotionId: "later-bundle", amount: 360 }] },
    ], orderPromotions: [], total: 2940,
  });
});

test("[boundary-5] an exclusive matching an already free line is reported and stops the chain", () => {
  assert.deepEqual(priceCart([{ productId: "zero-stop", unitPrice: 125, quantity: 4, tags: [] }], [
    { id: "wipe", priority: 1, exclusive: false, kind: "fixed", amount: 200 },
    { id: "stop-at-zero", priority: 2, exclusive: true, kind: "percent", percent: 25 },
    { id: "blocked", priority: 3, exclusive: false, kind: "bundle", buy: 1, free: 1 },
  ]), {
    lines: [{ productId: "zero-stop", total: 0, promotions: [
      { promotionId: "wipe", amount: 500 }, { promotionId: "stop-at-zero", amount: 0 },
    ] }], orderPromotions: [], total: 0,
  });
});

// Extends public: a skipped second exclusive still applies on another line that only it matches.
test("[boundary-6] three exclusive tags are evaluated independently on overlapping lines", () => {
  assert.deepEqual(priceCart([
    { productId: "all", unitPrice: 500, quantity: 4, tags: ["a", "b", "c"] },
    { productId: "b-and-c", unitPrice: 500, quantity: 4, tags: ["b", "c"] },
    { productId: "only-c", unitPrice: 500, quantity: 4, tags: ["c"] },
    { productId: "none", unitPrice: 500, quantity: 4, tags: [] },
  ], [
    { id: "c-stop", priority: 4, exclusive: true, tag: "c", kind: "bundle", buy: 1, free: 1 },
    { id: "b-stop", priority: 3, exclusive: true, tag: "b", kind: "percent", percent: 25 },
    { id: "a-stop", priority: 2, exclusive: true, tag: "a", kind: "fixed", amount: 50 },
    { id: "ordinary", priority: 1, exclusive: false, kind: "percent", percent: 20 },
    { id: "tail", priority: 5, exclusive: false, kind: "fixed", amount: 25 },
  ]), {
    lines: [
      { productId: "all", total: 1400, promotions: [{ promotionId: "ordinary", amount: 400 }, { promotionId: "a-stop", amount: 200 }] },
      { productId: "b-and-c", total: 1200, promotions: [{ promotionId: "ordinary", amount: 400 }, { promotionId: "b-stop", amount: 400 }] },
      { productId: "only-c", total: 800, promotions: [{ promotionId: "ordinary", amount: 400 }, { promotionId: "c-stop", amount: 800 }] },
      { productId: "none", total: 1500, promotions: [{ promotionId: "ordinary", amount: 400 }, { promotionId: "tail", amount: 100 }] },
    ], orderPromotions: [], total: 4900,
  });
});

// Extends public: equal-priority exclusives choose the earlier id.
test("[boundary-6] id ordering can place an ordinary discount before the first matching exclusive", () => {
  assert.deepEqual(priceCart([{ productId: "ties", unitPrice: 700, quantity: 2, tags: [] }], [
    { id: "delta", priority: 5, exclusive: true, kind: "fixed", amount: 200 },
    { id: "charlie", priority: 5, exclusive: false, kind: "fixed", amount: 50 },
    { id: "bravo", priority: 5, exclusive: true, kind: "percent", percent: 50 },
    { id: "alpha", priority: 5, exclusive: false, kind: "fixed", amount: 100 },
  ]), {
    lines: [{ productId: "ties", total: 600, promotions: [{ promotionId: "alpha", amount: 200 }, { promotionId: "bravo", amount: 600 }] }],
    orderPromotions: [], total: 600,
  });
});

test("[boundary-6] an earlier nonmatching exclusive does not hide a later matching exclusive", () => {
  assert.deepEqual(priceCart([{ productId: "second-tag", unitPrice: 300, quantity: 3, tags: ["second"] }], [
    { id: "alpha", priority: 1, exclusive: true, tag: "absent", kind: "fixed", amount: 100 },
    { id: "bravo", priority: 1, exclusive: true, tag: "second", kind: "percent", percent: 20 },
    { id: "charlie", priority: 1, exclusive: true, kind: "fixed", amount: 200 },
  ]), {
    lines: [{ productId: "second-tag", total: 720, promotions: [{ promotionId: "bravo", amount: 180 }] }],
    orderPromotions: [], total: 720,
  });
});
