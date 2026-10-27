import { test } from "node:test";
import assert from "node:assert/strict";
import { priceCart, type CartLine, type Promotion } from "../../src/index.js";

// Extends public: an unknown promotion kind fails with its id in the error.
test("[unhappy-1] kinds other than mystery are refused by an explicit four-kind check", () => {
  for (const kind of ["cashback", "Percent", "constructor", "__proto__", ""]) {
    const id = `bad-kind-${kind || "empty"}-47`;
    const invalid = { id, priority: 9, exclusive: false, kind } as unknown as Promotion;
    assert.throws(() => priceCart([
      { productId: "valid", unitPrice: 500, quantity: 4, tags: [] },
    ], [
      { id: "valid-fixed", priority: 1, exclusive: false, kind: "fixed", amount: 10 },
      invalid,
    ]), (error: unknown) => error instanceof Error && error.message.includes(id));
  }
});

// Extends public: an unknown kind is refused even when its tag matches no line.
test("[unhappy-1] an unknown kind is validated even when the cart is empty", () => {
  const invalid = {
    id: "empty-cart-invalid-kind-82", priority: 10, exclusive: false, tag: "missing", kind: "rebate",
  } as unknown as Promotion;
  assert.throws(() => priceCart([], [invalid]),
    (error: unknown) => error instanceof Error && error.message.includes("empty-cart-invalid-kind-82"));
});

test("[unhappy-1] a preceding exclusive cannot hide a later unknown kind", () => {
  const invalid = {
    id: "invalid-after-stop-93", priority: 2, exclusive: false, kind: "coupon",
  } as unknown as Promotion;
  assert.throws(() => priceCart([{ productId: "valid", unitPrice: 600, quantity: 2, tags: [] }], [
    { id: "stop", priority: 1, exclusive: true, kind: "percent", percent: 100 }, invalid,
  ]), (error: unknown) => error instanceof Error && error.message.includes("invalid-after-stop-93"));
});

test("[unhappy-1] zero-quantity lines do not bypass promotion kind validation", () => {
  const invalid = {
    id: "zero-only-invalid-kind-64", priority: 1, exclusive: false, kind: "flat",
  } as unknown as Promotion;
  assert.throws(() => priceCart([{ productId: "zero", unitPrice: 600, quantity: 0, tags: [] }], [invalid]),
    (error: unknown) => error instanceof Error && error.message.includes("zero-only-invalid-kind-64"));
});

// Extends public: duplicate promotion ids fail with the duplicated id in the error.
test("[unhappy-2] nonadjacent duplicate ids are refused in a longer promotion list", () => {
  assert.throws(() => priceCart([{ productId: "cart", unitPrice: 10000, quantity: 2, tags: [] }], [
    { id: "distant-repeat-72", priority: 1, exclusive: false, kind: "fixed", amount: 10 },
    { id: "middle-one", priority: 2, exclusive: false, kind: "percent", percent: 10 },
    { id: "middle-two", priority: 3, exclusive: false, kind: "bundle", buy: 2, free: 1 },
    { id: "middle-three", priority: 4, exclusive: false, kind: "fixed", amount: 20 },
    { id: "distant-repeat-72", priority: 5, exclusive: false, kind: "fixed", amount: 30 },
  ]), (error: unknown) => error instanceof Error && error.message.includes("distant-repeat-72"));
});

// Extends public: duplicate ids are refused across kinds even when tags do not match.
test("[unhappy-2] line and order promotions share the same id namespace", () => {
  assert.throws(() => priceCart([{ productId: "cart", unitPrice: 100, quantity: 1, tags: [] }], [
    { id: "shared-line-order-28", priority: 1, exclusive: false, tag: "missing", kind: "bundle", buy: 2, free: 1 },
    { id: "separate", priority: 2, exclusive: false, kind: "percent", percent: 10 },
    { id: "shared-line-order-28", priority: 3, exclusive: false, kind: "threshold", minimum: 50000, amount: 10 },
  ]), (error: unknown) => error instanceof Error && error.message.includes("shared-line-order-28"));
});

test("[unhappy-2] duplicate threshold ids are refused with no cart lines", () => {
  assert.throws(() => priceCart([], [
    { id: "empty-duplicate-56", priority: 3, exclusive: false, kind: "threshold", minimum: 100, amount: 20 },
    { id: "empty-duplicate-56", priority: 1, exclusive: false, kind: "threshold", minimum: 200, amount: 50 },
  ]), (error: unknown) => error instanceof Error && error.message.includes("empty-duplicate-56"));
});

test("[unhappy-2] duplicate ids are rejected even if the second would be blocked by exclusivity", () => {
  assert.throws(() => priceCart([{ productId: "cart", unitPrice: 1000, quantity: 1, tags: [] }], [
    { id: "blocked-duplicate-31", priority: 1, exclusive: true, kind: "percent", percent: 10 },
    { id: "middle", priority: 2, exclusive: false, kind: "fixed", amount: 10 },
    { id: "blocked-duplicate-31", priority: 3, exclusive: true, kind: "bundle", buy: 1, free: 1 },
  ]), (error: unknown) => error instanceof Error && error.message.includes("blocked-duplicate-31"));
});

// Extends public: a price one cent below zero fails with the product id.
test("[unhappy-3] negative prices later in the cart fail even with zero quantity", () => {
  for (const quantity of [0, 7]) {
    const productId = `later-negative-price-${quantity}-85`;
    assert.throws(() => priceCart([
      { productId: "valid-one", unitPrice: 500, quantity: 2, tags: [] },
      { productId: "valid-two", unitPrice: 800, quantity: 3, tags: [] },
      { productId, unitPrice: -250, quantity, tags: ["unmatched"] },
    ], [{ id: "unrelated", priority: 1, exclusive: false, tag: "elsewhere", kind: "fixed", amount: 10 }]),
    (error: unknown) => error instanceof Error && error.message.includes(productId));
  }
});

// Extends public: a negative quantity fails with the product id.
test("[unhappy-3] zero price cannot hide negative quantities other than minus one", () => {
  for (const quantity of [-8, -0.25]) {
    const productId = `negative-quantity-${quantity}-26`;
    assert.throws(() => priceCart([
      { productId: "valid", unitPrice: 0, quantity: 0, tags: [] },
      { productId, unitPrice: 0, quantity, tags: [] },
    ], [{ id: "wipe", priority: 1, exclusive: true, kind: "percent", percent: 100 }]),
    (error: unknown) => error instanceof Error && error.message.includes(productId));
  }
});

// Extends public: a positive non-whole quantity fails with the product id.
test("[unhappy-3] fractional quantities above one cannot be truncated to integers", () => {
  for (const quantity of [1.0001, 3.125, 1024.5]) {
    const productId = `fractional-${quantity}-79`;
    const lines: CartLine[] = Array.from({ length: 12 }, (_, i) => ({
      productId: `valid-${i}`, unitPrice: 200, quantity: i, tags: [],
    }));
    lines.push({ productId, unitPrice: 200, quantity, tags: [] });
    assert.throws(() => priceCart(lines, []),
      (error: unknown) => error instanceof Error && error.message.includes(productId));
  }
});

// Extends public: zero quantity is allowed and reports no line promotions.
test("[unhappy-3] zero quantities before and after a paid line never acquire promotions", () => {
  assert.deepEqual(priceCart([
    { productId: "zero-before", unitPrice: 900, quantity: 0, tags: ["sale"] },
    { productId: "paid", unitPrice: 300, quantity: 6, tags: ["sale"] },
    { productId: "zero-after", unitPrice: 1200, quantity: 0, tags: ["sale"] },
  ], [
    { id: "percent", priority: 1, exclusive: false, kind: "percent", percent: 50 },
    { id: "fixed", priority: 2, exclusive: false, tag: "sale", kind: "fixed", amount: 50 },
    { id: "bundle", priority: 3, exclusive: true, kind: "bundle", buy: 2, free: 1 },
    { id: "order", priority: 4, exclusive: false, kind: "threshold", minimum: 400, amount: 75 },
  ]), {
    lines: [
      { productId: "zero-before", total: 0, promotions: [] },
      { productId: "paid", total: 400, promotions: [{ promotionId: "percent", amount: 900 }, { promotionId: "fixed", amount: 300 }, { promotionId: "bundle", amount: 200 }] },
      { productId: "zero-after", total: 0, promotions: [] },
    ], orderPromotions: [{ promotionId: "order", amount: 75 }], total: 325,
  });
});

test("[unhappy-3] positive-quantity free lines report matching promotions unlike zero quantities", () => {
  assert.deepEqual(priceCart([
    { productId: "no-units", unitPrice: 0, quantity: 0, tags: ["sale"] },
    { productId: "free-units", unitPrice: 0, quantity: 9, tags: ["sale"] },
  ], [
    { id: "fixed", priority: 1, exclusive: false, tag: "sale", kind: "fixed", amount: 80 },
    { id: "percent", priority: 2, exclusive: false, kind: "percent", percent: 25 },
    { id: "bundle", priority: 3, exclusive: false, kind: "bundle", buy: 2, free: 1 },
  ]), {
    lines: [
      { productId: "no-units", total: 0, promotions: [] },
      { productId: "free-units", total: 0, promotions: [{ promotionId: "fixed", amount: 0 }, { promotionId: "percent", amount: 0 }, { promotionId: "bundle", amount: 0 }] },
    ], orderPromotions: [], total: 0,
  });
});
