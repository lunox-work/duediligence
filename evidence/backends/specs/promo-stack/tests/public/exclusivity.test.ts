import { test } from "node:test";
import assert from "node:assert/strict";
import { priceCart } from "../../src/index.js";

test("[boundary-5] an exclusive promotion applies after earlier promotions and blocks later ones", () => {
  const result = priceCart(
    [{ productId: "credits", unitPrice: 1000, quantity: 1, tags: [] }],
    [
      { id: "last", priority: 3, exclusive: false, kind: "percent", percent: 20 },
      { id: "exclusive", priority: 2, exclusive: true, kind: "fixed", amount: 100 },
      { id: "first", priority: 1, exclusive: false, kind: "percent", percent: 10 },
    ],
  );
  assert.deepEqual(result, {
    lines: [{ productId: "credits", total: 800, promotions: [
      { promotionId: "first", amount: 100 },
      { promotionId: "exclusive", amount: 100 },
    ] }],
    orderPromotions: [],
    total: 800,
  });
});

test("[boundary-5] an exclusive promotion first in order is the only one applied", () => {
  const result = priceCart(
    [{ productId: "credits", unitPrice: 1000, quantity: 1, tags: [] }],
    [
      { id: "later", priority: 2, exclusive: false, kind: "percent", percent: 20 },
      { id: "exclusive-fixed", priority: 1, exclusive: true, kind: "fixed", amount: 100 },
    ],
  );
  assert.deepEqual(result, {
    lines: [{ productId: "credits", total: 900, promotions: [{ promotionId: "exclusive-fixed", amount: 100 }] }],
    orderPromotions: [],
    total: 900,
  });
});

test("[boundary-6] a skipped second exclusive still applies on another line that only it matches", () => {
  const result = priceCart(
    [
      { productId: "tagged", unitPrice: 1000, quantity: 1, tags: ["credits"] },
      { productId: "untagged", unitPrice: 1000, quantity: 1, tags: [] },
    ],
    [
      { id: "second-exclusive", priority: 3, exclusive: true, kind: "fixed", amount: 200 },
      { id: "first-exclusive", priority: 2, exclusive: true, tag: "credits", kind: "fixed", amount: 100 },
      { id: "ordinary", priority: 1, exclusive: false, kind: "percent", percent: 10 },
    ],
  );
  assert.deepEqual(result, {
    lines: [
      { productId: "tagged", total: 800, promotions: [
        { promotionId: "ordinary", amount: 100 },
        { promotionId: "first-exclusive", amount: 100 },
      ] },
      { productId: "untagged", total: 700, promotions: [
        { promotionId: "ordinary", amount: 100 },
        { promotionId: "second-exclusive", amount: 200 },
      ] },
    ],
    orderPromotions: [],
    total: 1500,
  });
});

test("[boundary-6] equal-priority exclusives choose the earlier id", () => {
  const result = priceCart(
    [{ productId: "credits", unitPrice: 1000, quantity: 1, tags: [] }],
    [
      { id: "b", priority: 1, exclusive: true, kind: "fixed", amount: 200 },
      { id: "a", priority: 1, exclusive: true, kind: "fixed", amount: 100 },
    ],
  );
  assert.deepEqual(result, {
    lines: [{ productId: "credits", total: 900, promotions: [{ promotionId: "a", amount: 100 }] }],
    orderPromotions: [],
    total: 900,
  });
});
