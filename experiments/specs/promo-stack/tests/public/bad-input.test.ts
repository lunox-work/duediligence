import { test } from "node:test";
import assert from "node:assert/strict";
import { priceCart } from "../../src/index.js";
import type { CartLine, Promotion } from "../../src/index.js";

function line(productId: string, unitPrice: number, quantity: number, tags: string[] = []): CartLine {
  return { productId, unitPrice, quantity, tags };
}

function percent(id: string, value: number, priority = 1, tag?: string): Promotion {
  return { id, priority, exclusive: false, kind: "percent", percent: value, ...(tag === undefined ? {} : { tag }) };
}

function names(text: string): (err: unknown) => boolean {
  return (err: unknown) => err instanceof Error && err.message.includes(text);
}

test("[unhappy-1] a promotion of unknown kind is refused with an error naming its id", () => {
  const unknown = { id: "mystery-promo", priority: 2, exclusive: false, kind: "mystery", amount: 100 } as unknown as Promotion;

  assert.throws(() => priceCart([line("sku-1", 1000, 1)], [percent("ok-promo", 10), unknown]), names("mystery-promo"));
});

test("[unhappy-1] a promotion of unknown kind is refused even when its tag matches no line", () => {
  const unknown = {
    id: "ghost-kind",
    priority: 1,
    exclusive: false,
    kind: "Percent",
    percent: 10,
    tag: "nowhere",
  } as unknown as Promotion;

  assert.throws(() => priceCart([line("sku-1", 1000, 1)], [unknown]), names("ghost-kind"));
});

test("[unhappy-2] two promotions with the same id are refused with an error naming the id", () => {
  assert.throws(
    () => priceCart([line("sku-1", 1000, 1)], [percent("dup-id", 10, 1), percent("dup-id", 20, 2)]),
    names("dup-id"),
  );
});

test("[unhappy-2] a shared id is refused across different kinds, apart in the list, matching no line", () => {
  const promotions: Promotion[] = [
    percent("twice", 10, 1, "nowhere"),
    percent("unique", 5, 2),
    { id: "twice", priority: 3, exclusive: false, kind: "threshold", minimum: 999999, amount: 100 },
  ];

  assert.throws(() => priceCart([line("sku-1", 1000, 1)], promotions), names("twice"));
});

test("[unhappy-3] a line with a negative unit price is refused with an error naming the product id", () => {
  assert.throws(
    () => priceCart([line("good-sku", 1000, 1), line("neg-price-sku", -1, 1)], []),
    names("neg-price-sku"),
  );
});

test("[unhappy-3] a line with a negative quantity is refused with an error naming the product id", () => {
  assert.throws(
    () => priceCart([line("good-sku", 1000, 1), line("neg-qty-sku", 1000, -1)], []),
    names("neg-qty-sku"),
  );
});

test("[unhappy-3] a line with a non-whole quantity is refused with an error naming the product id", () => {
  assert.throws(
    () => priceCart([line("good-sku", 1000, 1), line("half-qty-sku", 1000, 1.5)], []),
    names("half-qty-sku"),
  );
});

test("[unhappy-3] a line with quantity 0 is allowed, totals 0 and reports no promotion", () => {
  const cart = priceCart([line("zero-sku", 1000, 0), line("one-sku", 1000, 1)], [percent("ten-off", 10)]);

  assert.equal(cart.lines[0].productId, "zero-sku");
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(cart.lines[0].promotions, []);
  assert.equal(cart.lines[1].total, 900);
  assert.deepEqual(cart.lines[1].promotions, [{ promotionId: "ten-off", amount: 100 }]);
  assert.equal(cart.total, 900);
});
