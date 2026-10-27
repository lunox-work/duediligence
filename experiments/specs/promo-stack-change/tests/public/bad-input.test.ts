import { test } from "node:test";
import assert from "node:assert/strict";
import {
  priceCart,
  type CartLine,
  type PercentPromotion,
  type Promotion,
  type ThresholdPromotion,
} from "../../src/index.js";

function line(productId: string, unitPrice: number, quantity: number, tags: string[] = []): CartLine {
  return { productId, unitPrice, quantity, tags };
}

function percent(id: string, priority: number, value: number, tag?: string): PercentPromotion {
  return {
    id,
    priority,
    exclusive: false,
    ...(tag !== undefined ? { tag } : {}),
    kind: "percent",
    percent: value,
  };
}

function threshold(id: string, priority: number, minimum: number, amount: number): ThresholdPromotion {
  return { id, priority, exclusive: false, kind: "threshold", minimum, amount };
}

function naming(name: string) {
  return (err: unknown) => {
    if (!(err instanceof Error)) {
      assert.fail(`expected an Error, got ${String(err)}`);
      return false;
    }
    assert.ok(err.message.includes(name), `expected "${err.message}" to name "${name}"`);
    return true;
  };
}

test("[unhappy-1] a promotion of an unknown kind is refused, naming its id", () => {
  const mystery = { id: "mystery-promo", priority: 1, exclusive: false, kind: "voucher", amount: 100 } as unknown as Promotion;
  assert.throws(() => priceCart([line("sku-1", 1000, 1)], [mystery]), naming("mystery-promo"));
});

test("[unhappy-1] a promotion of an unknown kind is refused even when it matches no line", () => {
  const mystery = {
    id: "mystery-promo",
    priority: 2,
    exclusive: false,
    tag: "nowhere",
    kind: "voucher",
    amount: 100,
  } as unknown as Promotion;
  assert.throws(
    () => priceCart([line("sku-1", 1000, 1)], [percent("pct-10", 1, 10), mystery]),
    naming("mystery-promo"),
  );
});

test("[unhappy-2] two promotions with the same id are refused, naming the id", () => {
  assert.throws(
    () => priceCart([line("sku-1", 1000, 1)], [percent("dup-id", 1, 10), percent("dup-id", 2, 20)]),
    naming("dup-id"),
  );
});

test("[unhappy-2] promotions of different kinds sharing an id are refused", () => {
  assert.throws(
    () => priceCart([line("sku-1", 1000, 1)], [percent("dup-id", 1, 10), threshold("dup-id", 1, 999999, 100)]),
    naming("dup-id"),
  );
});

test("[unhappy-3] a line with a negative unit price is refused, naming the product id", () => {
  assert.throws(
    () => priceCart([line("good-sku", 1000, 1), line("negative-price-sku", -1, 1)], []),
    naming("negative-price-sku"),
  );
});

test("[unhappy-3] a line with a negative quantity is refused, naming the product id", () => {
  assert.throws(
    () => priceCart([line("negative-qty-sku", 1000, -1)], []),
    naming("negative-qty-sku"),
  );
});

test("[unhappy-3] a line with a non-whole quantity is refused, naming the product id", () => {
  assert.throws(
    () => priceCart([line("fractional-qty-sku", 1000, 1.5)], []),
    naming("fractional-qty-sku"),
  );
});

test("[unhappy-3] a line with quantity 0 is allowed, totals 0 and reports no promotion", () => {
  const cart = priceCart([line("empty-line", 1000, 0)], [percent("pct-10", 1, 10)]);
  assert.equal(cart.lines.length, 1);
  assert.equal(cart.lines[0].productId, "empty-line");
  assert.equal(cart.lines[0].total, 0);
  assert.deepEqual(cart.lines[0].promotions, []);
  assert.equal(cart.total, 0);
});
