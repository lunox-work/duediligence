import { test } from "node:test";
import assert from "node:assert/strict";
import { priceCart } from "../../src/index.js";

test("[happy-4] a threshold exactly met after line discounts applies to the order", () => {
  const result = priceCart(
    [
      { productId: "first", unitPrice: 3000, quantity: 1, tags: [] },
      { productId: "second", unitPrice: 3000, quantity: 1, tags: [] },
    ],
    [
      { id: "order-off", priority: 1, exclusive: false, kind: "threshold", minimum: 5000, amount: 500 },
      { id: "line-off", priority: 2, exclusive: false, kind: "fixed", amount: 500 },
    ],
  );
  assert.deepEqual(result, {
    lines: [
      { productId: "first", total: 2500, promotions: [{ promotionId: "line-off", amount: 500 }] },
      { productId: "second", total: 2500, promotions: [{ promotionId: "line-off", amount: 500 }] },
    ],
    orderPromotions: [{ promotionId: "order-off", amount: 500 }],
    total: 4500,
  });
});

test("[happy-4] a threshold one cent above the discounted subtotal is not reported", () => {
  const result = priceCart(
    [{ productId: "credits", unitPrice: 6000, quantity: 1, tags: [] }],
    [
      { id: "not-met", priority: 1, exclusive: false, kind: "threshold", minimum: 5001, amount: 500 },
      { id: "line-off", priority: 2, exclusive: false, kind: "fixed", amount: 1000 },
    ],
  );
  assert.deepEqual(result, {
    lines: [{ productId: "credits", total: 5000, promotions: [{ promotionId: "line-off", amount: 1000 }] }],
    orderPromotions: [],
    total: 5000,
  });
});

test("[boundary-7] qualifying thresholds apply in priority then id order", () => {
  const result = priceCart(
    [{ productId: "credits", unitPrice: 10000, quantity: 1, tags: [] }],
    [
      { id: "b", priority: 2, exclusive: false, kind: "threshold", minimum: 5000, amount: 200 },
      { id: "z", priority: 1, exclusive: false, kind: "threshold", minimum: 9000, amount: 1000 },
      { id: "a", priority: 2, exclusive: false, kind: "threshold", minimum: 5000, amount: 600 },
    ],
  );
  assert.deepEqual(result, {
    lines: [{ productId: "credits", total: 10000, promotions: [] }],
    orderPromotions: [
      { promotionId: "z", amount: 1000 },
      { promotionId: "a", amount: 600 },
      { promotionId: "b", amount: 200 },
    ],
    total: 8200,
  });
});

test("[boundary-7] later thresholds qualify against the subtotal before any order discounts", () => {
  const result = priceCart(
    [{ productId: "credits", unitPrice: 10000, quantity: 1, tags: [] }],
    [
      { id: "first", priority: 1, exclusive: false, kind: "threshold", minimum: 5000, amount: 600 },
      { id: "second", priority: 2, exclusive: false, kind: "threshold", minimum: 10000, amount: 1000 },
    ],
  );
  assert.deepEqual(result, {
    lines: [{ productId: "credits", total: 10000, promotions: [] }],
    orderPromotions: [
      { promotionId: "first", amount: 600 },
      { promotionId: "second", amount: 1000 },
    ],
    total: 8400,
  });
});

test("[boundary-7] combined qualifying thresholds cannot make the order total negative", () => {
  const result = priceCart(
    [{ productId: "credits", unitPrice: 1000, quantity: 1, tags: [] }],
    [
      { id: "first", priority: 1, exclusive: false, kind: "threshold", minimum: 1000, amount: 600 },
      { id: "second", priority: 2, exclusive: false, kind: "threshold", minimum: 1000, amount: 600 },
    ],
  );
  assert.deepEqual(result.lines, [{ productId: "credits", total: 1000, promotions: [] }]);
  assert.deepEqual(result.orderPromotions.map((promotion) => promotion.promotionId), ["first", "second"]);
  // The spec caps the order total, but does not define whether each order
  // promotion's reported amount is also capped when the discounts exceed it.
  assert.equal(result.total, 0);
});
