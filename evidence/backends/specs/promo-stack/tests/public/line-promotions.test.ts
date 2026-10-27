import { test } from "node:test";
import assert from "node:assert/strict";
import { priceCart } from "../../src/index.js";

test("[happy-1] an untagged percentage discounts the entire line total", () => {
  const result = priceCart(
    [{ productId: "credits", unitPrice: 1000, quantity: 3, tags: [] }],
    [{ id: "ten-percent", priority: 1, exclusive: false, kind: "percent", percent: 10 }],
  );
  assert.deepEqual(result, {
    lines: [{ productId: "credits", total: 2700, promotions: [{ promotionId: "ten-percent", amount: 300 }] }],
    orderPromotions: [],
    total: 2700,
  });
});

test("[happy-1] a tagged percentage only discounts lines carrying its tag", () => {
  const result = priceCart(
    [
      { productId: "matching", unitPrice: 1000, quantity: 1, tags: ["sale"] },
      { productId: "other", unitPrice: 1000, quantity: 1, tags: [] },
    ],
    [{ id: "sale-percent", priority: 1, exclusive: false, tag: "sale", kind: "percent", percent: 10 }],
  );
  assert.deepEqual(result, {
    lines: [
      { productId: "matching", total: 900, promotions: [{ promotionId: "sale-percent", amount: 100 }] },
      { productId: "other", total: 1000, promotions: [] },
    ],
    orderPromotions: [],
    total: 1900,
  });
});

test("[happy-2] a tagged fixed promotion discounts every matching unit", () => {
  const result = priceCart(
    [
      { productId: "matching", unitPrice: 1500, quantity: 2, tags: ["featured", "credits"] },
      { productId: "other", unitPrice: 1500, quantity: 2, tags: ["other"] },
    ],
    [{ id: "credits-off", priority: 1, exclusive: false, tag: "credits", kind: "fixed", amount: 200 }],
  );
  assert.deepEqual(result, {
    lines: [
      { productId: "matching", total: 2600, promotions: [{ promotionId: "credits-off", amount: 400 }] },
      { productId: "other", total: 3000, promotions: [] },
    ],
    orderPromotions: [],
    total: 5600,
  });
});

test("[happy-2] a fixed discount equal to the unit price makes the line free", () => {
  const result = priceCart(
    [{ productId: "credits", unitPrice: 200, quantity: 2, tags: ["credits"] }],
    [{ id: "exact-fixed", priority: 1, exclusive: false, tag: "credits", kind: "fixed", amount: 200 }],
  );
  assert.deepEqual(result, {
    lines: [{ productId: "credits", total: 0, promotions: [{ promotionId: "exact-fixed", amount: 400 }] }],
    orderPromotions: [],
    total: 0,
  });
});

test("[happy-3] a bundle discounts full groups and leaves the remainder paid", () => {
  const result = priceCart(
    [{ productId: "credits", unitPrice: 500, quantity: 7, tags: [] }],
    [{ id: "buy-two", priority: 1, exclusive: false, kind: "bundle", buy: 2, free: 1 }],
  );
  assert.deepEqual(result, {
    lines: [{ productId: "credits", total: 2500, promotions: [{ promotionId: "buy-two", amount: 1000 }] }],
    orderPromotions: [],
    total: 2500,
  });
});

test("[happy-3] a bundle discounts exactly one group at the qualifying quantity", () => {
  const result = priceCart(
    [{ productId: "credits", unitPrice: 500, quantity: 3, tags: [] }],
    [{ id: "buy-two", priority: 1, exclusive: false, kind: "bundle", buy: 2, free: 1 }],
  );
  assert.deepEqual(result, {
    lines: [{ productId: "credits", total: 1000, promotions: [{ promotionId: "buy-two", amount: 500 }] }],
    orderPromotions: [],
    total: 1000,
  });
});

test("[boundary-1] priority orders promotions before each uses the remaining total", () => {
  const result = priceCart(
    [{ productId: "credits", unitPrice: 1000, quantity: 1, tags: [] }],
    [
      { id: "a", priority: 2, exclusive: false, kind: "fixed", amount: 100 },
      { id: "b", priority: 1, exclusive: false, kind: "percent", percent: 50 },
    ],
  );
  assert.deepEqual(result, {
    lines: [{ productId: "credits", total: 400, promotions: [
      { promotionId: "b", amount: 500 },
      { promotionId: "a", amount: 100 },
    ] }],
    orderPromotions: [],
    total: 400,
  });
});

test("[boundary-1] equal priorities use id order rather than input order", () => {
  const result = priceCart(
    [{ productId: "credits", unitPrice: 1000, quantity: 1, tags: [] }],
    [
      { id: "b", priority: 1, exclusive: false, kind: "percent", percent: 50 },
      { id: "a", priority: 1, exclusive: false, kind: "fixed", amount: 100 },
    ],
  );
  assert.deepEqual(result, {
    lines: [{ productId: "credits", total: 450, promotions: [
      { promotionId: "a", amount: 100 },
      { promotionId: "b", amount: 450 },
    ] }],
    orderPromotions: [],
    total: 450,
  });
});

test("[boundary-2] a bundle values free units after an earlier percentage", () => {
  const result = priceCart(
    [{ productId: "credits", unitPrice: 1000, quantity: 4, tags: [] }],
    [
      { id: "bundle", priority: 2, exclusive: false, kind: "bundle", buy: 1, free: 1 },
      { id: "half", priority: 1, exclusive: false, kind: "percent", percent: 50 },
    ],
  );
  assert.deepEqual(result, {
    lines: [{ productId: "credits", total: 1000, promotions: [
      { promotionId: "half", amount: 2000 },
      { promotionId: "bundle", amount: 1000 },
    ] }],
    orderPromotions: [],
    total: 1000,
  });
});

test("[boundary-2] a bundle rounds a half-cent current free-unit value up", () => {
  const result = priceCart(
    [{ productId: "credits", unitPrice: 101, quantity: 2, tags: [] }],
    [
      { id: "half", priority: 1, exclusive: false, kind: "percent", percent: 50 },
      { id: "bundle", priority: 2, exclusive: false, kind: "bundle", buy: 1, free: 1 },
    ],
  );
  assert.deepEqual(result, {
    lines: [{ productId: "credits", total: 50, promotions: [
      { promotionId: "half", amount: 101 },
      { promotionId: "bundle", amount: 51 },
    ] }],
    orderPromotions: [],
    total: 50,
  });
});

test("[boundary-3] a percentage discount below half a cent rounds down", () => {
  const result = priceCart(
    [{ productId: "credits", unitPrice: 101, quantity: 1, tags: [] }],
    [{ id: "third", priority: 1, exclusive: false, kind: "percent", percent: 33 }],
  );
  assert.deepEqual(result, {
    lines: [{ productId: "credits", total: 68, promotions: [{ promotionId: "third", amount: 33 }] }],
    orderPromotions: [],
    total: 68,
  });
});

test("[boundary-3] a percentage discount at exactly half a cent rounds up", () => {
  const result = priceCart(
    [{ productId: "credits", unitPrice: 150, quantity: 1, tags: [] }],
    [{ id: "fifteen", priority: 1, exclusive: false, kind: "percent", percent: 15 }],
  );
  assert.deepEqual(result, {
    lines: [{ productId: "credits", total: 127, promotions: [{ promotionId: "fifteen", amount: 23 }] }],
    orderPromotions: [],
    total: 127,
  });
});

test("[boundary-4] an oversized fixed discount reports only the amount available", () => {
  const result = priceCart(
    [{ productId: "credits", unitPrice: 300, quantity: 2, tags: [] }],
    [{ id: "large-fixed", priority: 1, exclusive: false, kind: "fixed", amount: 500 }],
  );
  assert.deepEqual(result, {
    lines: [{ productId: "credits", total: 0, promotions: [{ promotionId: "large-fixed", amount: 600 }] }],
    orderPromotions: [],
    total: 0,
  });
});

test("[boundary-4] matching promotions after the line reaches zero are still reported", () => {
  const result = priceCart(
    [{ productId: "credits", unitPrice: 300, quantity: 2, tags: [] }],
    [
      { id: "empty-line", priority: 1, exclusive: false, kind: "fixed", amount: 500 },
      { id: "percent", priority: 2, exclusive: false, kind: "percent", percent: 10 },
      { id: "bundle", priority: 3, exclusive: false, kind: "bundle", buy: 1, free: 1 },
      { id: "fixed", priority: 4, exclusive: false, kind: "fixed", amount: 100 },
    ],
  );
  assert.deepEqual(result, {
    lines: [{ productId: "credits", total: 0, promotions: [
      { promotionId: "empty-line", amount: 600 },
      { promotionId: "percent", amount: 0 },
      { promotionId: "bundle", amount: 0 },
      { promotionId: "fixed", amount: 0 },
    ] }],
    orderPromotions: [],
    total: 0,
  });
});
