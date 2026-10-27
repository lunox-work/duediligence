import { test } from "node:test";
import assert from "node:assert/strict";
import { priceCart, type Promotion } from "../../src/index.js";

test("[unhappy-1] an unknown promotion kind fails with its id in the error", () => {
  const unknownPromotion = {
    id: "unknown-promotion", priority: 1, exclusive: false, kind: "mystery",
  } as unknown as Promotion;
  assert.throws(
    () => priceCart([{ productId: "credits", unitPrice: 1000, quantity: 1, tags: [] }], [unknownPromotion]),
    (error: unknown) => error instanceof Error && error.message.includes("unknown-promotion"),
  );
});

test("[unhappy-1] an unknown kind is refused even when its tag matches no line", () => {
  const unknownPromotion = {
    id: "unmatched-unknown", priority: 1, exclusive: false, tag: "absent", kind: "mystery",
  } as unknown as Promotion;
  assert.throws(
    () => priceCart([{ productId: "credits", unitPrice: 1000, quantity: 1, tags: [] }], [unknownPromotion]),
    (error: unknown) => error instanceof Error && error.message.includes("unmatched-unknown"),
  );
});

test("[unhappy-2] duplicate promotion ids fail with the duplicated id in the error", () => {
  assert.throws(
    () => priceCart(
      [{ productId: "credits", unitPrice: 1000, quantity: 1, tags: [] }],
      [
        { id: "duplicate-id", priority: 1, exclusive: false, kind: "fixed", amount: 100 },
        { id: "duplicate-id", priority: 2, exclusive: false, kind: "fixed", amount: 200 },
      ],
    ),
    (error: unknown) => error instanceof Error && error.message.includes("duplicate-id"),
  );
});

test("[unhappy-2] duplicate ids are refused across kinds even when tags do not match", () => {
  assert.throws(
    () => priceCart(
      [{ productId: "credits", unitPrice: 1000, quantity: 1, tags: [] }],
      [
        { id: "cross-kind-id", priority: 1, exclusive: false, tag: "one", kind: "percent", percent: 10 },
        { id: "cross-kind-id", priority: 2, exclusive: false, tag: "two", kind: "fixed", amount: 100 },
      ],
    ),
    (error: unknown) => error instanceof Error && error.message.includes("cross-kind-id"),
  );
});

test("[unhappy-3] a price one cent below zero fails with the product id", () => {
  assert.throws(
    () => priceCart([{ productId: "negative-price", unitPrice: -1, quantity: 1, tags: [] }], []),
    (error: unknown) => error instanceof Error && error.message.includes("negative-price"),
  );
});

test("[unhappy-3] a negative quantity fails with the product id", () => {
  assert.throws(
    () => priceCart([{ productId: "negative-quantity", unitPrice: 1000, quantity: -1, tags: [] }], []),
    (error: unknown) => error instanceof Error && error.message.includes("negative-quantity"),
  );
});

test("[unhappy-3] a positive non-whole quantity fails with the product id", () => {
  assert.throws(
    () => priceCart([{ productId: "fractional-quantity", unitPrice: 1000, quantity: 0.5, tags: [] }], []),
    (error: unknown) => error instanceof Error && error.message.includes("fractional-quantity"),
  );
});

test("[unhappy-3] zero quantity is allowed and reports no line promotions", () => {
  const result = priceCart(
    [
      { productId: "zero-quantity", unitPrice: 1000, quantity: 0, tags: ["credits"] },
      { productId: "zero-price", unitPrice: 0, quantity: 2, tags: [] },
    ],
    [
      { id: "percent", priority: 1, exclusive: false, kind: "percent", percent: 10 },
      { id: "fixed", priority: 2, exclusive: false, tag: "credits", kind: "fixed", amount: 100 },
      { id: "bundle", priority: 3, exclusive: false, kind: "bundle", buy: 1, free: 1 },
    ],
  );
  assert.deepEqual(result, {
    lines: [
      { productId: "zero-quantity", total: 0, promotions: [] },
      { productId: "zero-price", total: 0, promotions: [
        { promotionId: "percent", amount: 0 },
        { promotionId: "bundle", amount: 0 },
      ] },
    ],
    orderPromotions: [],
    total: 0,
  });
});
